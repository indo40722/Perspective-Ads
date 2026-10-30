-- 会社ごとの広告データ、メンバー権限、端末配信と特典記録を定義する。
create table public.organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(trim(name)) between 1 and 120),
    active_campaign_id text,
    created_at timestamptz not null default now()
);

create table public.organization_memberships (
    organization_id uuid not null references public.organizations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
    created_at timestamptz not null default now(),
    primary key (organization_id, user_id)
);

create index organization_memberships_user_id_idx
    on public.organization_memberships (user_id, organization_id);

create table public.campaigns (
    campaign_id text primary key check (campaign_id ~ '^[a-z0-9][a-z0-9_-]{1,47}$'),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    campaign_data jsonb not null check (jsonb_typeof(campaign_data) = 'object'),
    is_published boolean not null default false,
    updated_at timestamptz not null default now(),
    published_at timestamptz,
    unique (organization_id, campaign_id),
    check (campaign_data->>'id' = campaign_id)
);

create index campaigns_organization_updated_idx
    on public.campaigns (organization_id, updated_at desc);

create index campaigns_publication_idx
    on public.campaigns (campaign_id) where is_published;

alter table public.organizations
    add constraint organizations_active_campaign_fk
    foreign key (active_campaign_id) references public.campaigns(campaign_id) on delete set null;

create table public.reward_draws (
    campaign_id text not null references public.campaigns(campaign_id) on delete cascade,
    session_id text not null check (char_length(session_id) between 16 and 128),
    won boolean not null,
    chance_percent integer not null check (chance_percent between 0 and 100),
    created_at timestamptz not null default now(),
    primary key (campaign_id, session_id)
);

create table public.campaign_events (
    event_id text primary key check (char_length(event_id) between 16 and 128),
    session_id text not null check (char_length(session_id) between 16 and 128),
    campaign_id text not null references public.campaigns(campaign_id) on delete cascade,
    event_type text not null check (event_type in ('detail_found')),
    detail_id text not null check (detail_id in ('grill', 'cut')),
    created_at timestamptz not null default now()
);

create index campaign_events_campaign_created_idx
    on public.campaign_events (campaign_id, created_at desc);

create table public.coupon_visits (
    visit_id text primary key check (char_length(visit_id) between 16 and 128),
    campaign_id text not null references public.campaigns(campaign_id) on delete cascade,
    created_at timestamptz not null default now()
);

create table public.coupon_claims (
    claim_id text primary key check (char_length(claim_id) between 16 and 128),
    campaign_id text not null references public.campaigns(campaign_id) on delete cascade,
    code text not null unique check (code ~ '^CHAR-[A-F0-9]{12}$'),
    status text not null check (status in ('issued', 'redeemed')) default 'issued',
    issued_at timestamptz not null default now(),
    redeemed_at timestamptz
);

create index coupon_claims_campaign_status_idx
    on public.coupon_claims (campaign_id, status, issued_at desc);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.has_organization_role(target_organization_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.organization_memberships as membership
        where membership.organization_id = target_organization_id
          and membership.user_id = (select auth.uid())
          and membership.role = any (allowed_roles)
    );
$$;

revoke all on function private.has_organization_role(uuid, text[]) from public;
grant usage on schema private to authenticated;
grant execute on function private.has_organization_role(uuid, text[]) to anon, authenticated;

create or replace function public.create_organization(organization_name text)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
    created_organization public.organizations;
begin
    if auth.uid() is null then
        raise exception 'ログインしてください';
    end if;
    if organization_name is null or char_length(trim(organization_name)) not between 1 and 120 then
        raise exception '会社名を1〜120文字で入力してください';
    end if;

    insert into public.organizations (name)
    values (trim(organization_name))
    returning * into created_organization;

    insert into public.organization_memberships (organization_id, user_id, role)
    values (created_organization.id, auth.uid(), 'owner');

    return created_organization;
end;
$$;

revoke all on function public.create_organization(text) from public, anon;
grant execute on function public.create_organization(text) to authenticated;

create or replace function public.set_active_campaign(target_organization_id uuid, target_campaign_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not private.has_organization_role(target_organization_id, array['owner', 'admin', 'editor']) then
        raise exception 'この広告を切り替える権限がありません';
    end if;

    if not exists (
        select 1 from public.campaigns
        where campaign_id = target_campaign_id
          and organization_id = target_organization_id
          and is_published
    ) then
        raise exception '公開中の広告を選択してください';
    end if;

    update public.organizations
    set active_campaign_id = target_campaign_id
    where id = target_organization_id;
end;
$$;

revoke all on function public.set_active_campaign(uuid, text) from public, anon;
grant execute on function public.set_active_campaign(uuid, text) to authenticated;

create or replace function public.draw_campaign_reward(target_campaign_id text, target_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    configured_chance integer;
    draw_result public.reward_draws;
begin
    if char_length(target_session_id) not between 16 and 128 then
        raise exception '抽選セッションが正しくありません';
    end if;

    select coalesce((campaign_data #>> '{reward,chancePercent}')::integer, 100)
    into configured_chance
    from public.campaigns
    where campaign_id = target_campaign_id and is_published;

    if not found then
        raise exception '公開中の広告が見つかりません';
    end if;
    if configured_chance not between 0 and 100 then
        raise exception '特典表示確率が正しくありません';
    end if;

    insert into public.reward_draws (campaign_id, session_id, won, chance_percent)
    values (target_campaign_id, target_session_id, random() * 100 < configured_chance, configured_chance)
    on conflict (campaign_id, session_id) do nothing;

    select * into draw_result
    from public.reward_draws
    where campaign_id = target_campaign_id and session_id = target_session_id;

    return jsonb_build_object('won', draw_result.won, 'chancePercent', draw_result.chance_percent);
end;
$$;

revoke all on function public.draw_campaign_reward(text, text) from public;
grant execute on function public.draw_campaign_reward(text, text) to anon, authenticated;

create or replace function public.record_campaign_event(
    target_event_id text,
    target_session_id text,
    target_campaign_id text,
    target_event_type text,
    target_detail_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
    if char_length(target_event_id) not between 16 and 128
       or char_length(target_session_id) not between 16 and 128
       or target_event_type <> 'detail_found'
       or target_detail_id not in ('grill', 'cut') then
        raise exception '広告イベントの内容が正しくありません';
    end if;
    if not exists (
        select 1 from public.campaigns
        where campaign_id = target_campaign_id and is_published
    ) then
        raise exception '公開中の広告が見つかりません';
    end if;

    insert into public.campaign_events (event_id, session_id, campaign_id, event_type, detail_id)
    values (target_event_id, target_session_id, target_campaign_id, target_event_type, target_detail_id)
    on conflict (event_id) do nothing;

    return jsonb_build_object('recorded', true);
end;
$$;

revoke all on function public.record_campaign_event(text, text, text, text, text) from public;
grant execute on function public.record_campaign_event(text, text, text, text, text) to anon, authenticated;

create or replace function public.record_coupon_visit(target_visit_id text, target_campaign_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
    if char_length(target_visit_id) not between 16 and 128 then
        raise exception '訪問IDが正しくありません';
    end if;
    if not exists (
        select 1 from public.campaigns
        where campaign_id = target_campaign_id and is_published
    ) then
        raise exception '公開中の広告が見つかりません';
    end if;

    insert into public.coupon_visits (visit_id, campaign_id)
    values (target_visit_id, target_campaign_id)
    on conflict (visit_id) do nothing;

    return jsonb_build_object('recorded', true);
end;
$$;

revoke all on function public.record_coupon_visit(text, text) from public;
grant execute on function public.record_coupon_visit(text, text) to anon, authenticated;

create or replace function public.claim_campaign_coupon(target_claim_id text, target_campaign_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    issued_coupon public.coupon_claims;
begin
    if char_length(target_claim_id) not between 16 and 128 then
        raise exception '受取IDが正しくありません';
    end if;
    if not exists (
        select 1 from public.campaigns
        where campaign_id = target_campaign_id and is_published
    ) then
        raise exception '公開中の広告が見つかりません';
    end if;

    insert into public.coupon_claims (claim_id, campaign_id, code)
    values (
        target_claim_id,
        target_campaign_id,
        'CHAR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
    )
    on conflict (claim_id) do nothing;

    select * into issued_coupon
    from public.coupon_claims
    where claim_id = target_claim_id and campaign_id = target_campaign_id;

    if not found then
        raise exception 'この受取IDは別の広告ですでに使用されています';
    end if;

    return jsonb_build_object(
        'campaignId', issued_coupon.campaign_id,
        'claimId', issued_coupon.claim_id,
        'code', issued_coupon.code,
        'status', issued_coupon.status,
        'issuedAt', issued_coupon.issued_at,
        'redeemedAt', issued_coupon.redeemed_at
    );
end;
$$;

revoke all on function public.claim_campaign_coupon(text, text) from public;
grant execute on function public.claim_campaign_coupon(text, text) to anon, authenticated;

create or replace function public.get_campaign_coupon(target_claim_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    found_coupon public.coupon_claims;
begin
    select * into found_coupon
    from public.coupon_claims
    where claim_id = target_claim_id;

    if not found then
        raise exception '特典コードが見つかりません';
    end if;

    return jsonb_build_object(
        'campaignId', found_coupon.campaign_id,
        'claimId', found_coupon.claim_id,
        'code', found_coupon.code,
        'status', found_coupon.status,
        'issuedAt', found_coupon.issued_at,
        'redeemedAt', found_coupon.redeemed_at
    );
end;
$$;

revoke all on function public.get_campaign_coupon(text) from public;
grant execute on function public.get_campaign_coupon(text) to anon, authenticated;

create or replace function public.redeem_campaign_coupon(target_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    redeemed_coupon public.coupon_claims;
begin
    if auth.uid() is null then
        raise exception '利用確認にはログインが必要です';
    end if;

    select coupon.* into redeemed_coupon
    from public.coupon_claims as coupon
    join public.campaigns as campaign on campaign.campaign_id = coupon.campaign_id
    where coupon.code = upper(trim(target_code))
      and coupon.status = 'issued'
      and private.has_organization_role(campaign.organization_id, array['owner', 'admin', 'editor']);

    if not found then
        raise exception '有効な特典コードが見つからないか、利用済みです';
    end if;

    update public.coupon_claims
    set status = 'redeemed', redeemed_at = now()
    where claim_id = redeemed_coupon.claim_id
      and status = 'issued'
    returning * into redeemed_coupon;

    if not found then
        raise exception 'この特典コードはすでに利用済みです';
    end if;

    return jsonb_build_object(
        'campaignId', redeemed_coupon.campaign_id,
        'claimId', redeemed_coupon.claim_id,
        'code', redeemed_coupon.code,
        'status', redeemed_coupon.status,
        'issuedAt', redeemed_coupon.issued_at,
        'redeemedAt', redeemed_coupon.redeemed_at
    );
end;
$$;

revoke all on function public.redeem_campaign_coupon(text) from public, anon;
grant execute on function public.redeem_campaign_coupon(text) to authenticated;

create or replace function public.get_organization_campaign_stats(target_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    result jsonb;
begin
    if not private.has_organization_role(target_organization_id, array['owner', 'admin', 'editor', 'viewer']) then
        raise exception '集計を見る権限がありません';
    end if;

    select jsonb_build_object(
        'visits', (select count(*) from public.coupon_visits v join public.campaigns c using (campaign_id) where c.organization_id = target_organization_id),
        'grillViews', (select count(*) from public.campaign_events e join public.campaigns c using (campaign_id) where c.organization_id = target_organization_id and e.detail_id = 'grill'),
        'cutViews', (select count(*) from public.campaign_events e join public.campaigns c using (campaign_id) where c.organization_id = target_organization_id and e.detail_id = 'cut'),
        'issued', (select count(*) from public.coupon_claims q join public.campaigns c using (campaign_id) where c.organization_id = target_organization_id),
        'redeemed', (select count(*) from public.coupon_claims q join public.campaigns c using (campaign_id) where c.organization_id = target_organization_id and q.status = 'redeemed')
    ) into result;

    return result;
end;
$$;

revoke all on function public.get_organization_campaign_stats(uuid) from public, anon;
grant execute on function public.get_organization_campaign_stats(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.campaigns enable row level security;
alter table public.reward_draws enable row level security;
alter table public.campaign_events enable row level security;
alter table public.coupon_visits enable row level security;
alter table public.coupon_claims enable row level security;

revoke all on table public.organizations, public.organization_memberships, public.campaigns,
    public.reward_draws, public.campaign_events,
    public.coupon_visits, public.coupon_claims from anon, authenticated;

grant select on table public.organizations, public.organization_memberships to authenticated;
grant select, insert, update, delete on table public.campaigns to authenticated;
grant select (campaign_id, campaign_data, is_published, updated_at, published_at)
    on table public.campaigns to anon;
grant select on table public.reward_draws, public.campaign_events, public.coupon_visits,
    public.coupon_claims to authenticated;

create policy organization_members_read_own
    on public.organizations for select to authenticated
    using (private.has_organization_role(id, array['owner', 'admin', 'editor', 'viewer']));

create policy memberships_read_same_organization
    on public.organization_memberships for select to authenticated
    using (private.has_organization_role(organization_id, array['owner', 'admin', 'editor', 'viewer']));

create policy campaigns_read_public_or_member
    on public.campaigns for select to anon, authenticated
    using (is_published or private.has_organization_role(organization_id, array['owner', 'admin', 'editor', 'viewer']));

create policy campaign_editors_insert
    on public.campaigns for insert to authenticated
    with check (private.has_organization_role(organization_id, array['owner', 'admin', 'editor']));

create policy campaign_editors_update
    on public.campaigns for update to authenticated
    using (private.has_organization_role(organization_id, array['owner', 'admin', 'editor']))
    with check (private.has_organization_role(organization_id, array['owner', 'admin', 'editor']));

create policy campaign_admins_delete
    on public.campaigns for delete to authenticated
    using (private.has_organization_role(organization_id, array['owner', 'admin']));

create policy reward_draws_members_read
    on public.reward_draws for select to authenticated
    using (exists (
        select 1 from public.campaigns campaign
        where campaign.campaign_id = reward_draws.campaign_id
          and private.has_organization_role(campaign.organization_id, array['owner', 'admin', 'editor', 'viewer'])
    ));

create policy campaign_events_members_read
    on public.campaign_events for select to authenticated
    using (exists (
        select 1 from public.campaigns campaign
        where campaign.campaign_id = campaign_events.campaign_id
          and private.has_organization_role(campaign.organization_id, array['owner', 'admin', 'editor', 'viewer'])
    ));

create policy coupon_visits_members_read
    on public.coupon_visits for select to authenticated
    using (exists (
        select 1 from public.campaigns campaign
        where campaign.campaign_id = coupon_visits.campaign_id
          and private.has_organization_role(campaign.organization_id, array['owner', 'admin', 'editor', 'viewer'])
    ));

create policy coupon_claims_members_read
    on public.coupon_claims for select to authenticated
    using (exists (
        select 1 from public.campaigns campaign
        where campaign.campaign_id = coupon_claims.campaign_id
          and private.has_organization_role(campaign.organization_id, array['owner', 'admin', 'editor', 'viewer'])
    ));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campaign-assets', 'campaign-assets', true, 16777216, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy campaign_assets_members_read
    on storage.objects for select to authenticated
    using (
        bucket_id = 'campaign-assets'
        and exists (
            select 1 from public.organization_memberships membership
            where membership.organization_id::text = (storage.foldername(name))[1]
              and membership.user_id = (select auth.uid())
              and membership.role in ('owner', 'admin', 'editor', 'viewer')
        )
    );

create policy campaign_assets_members_upload
    on storage.objects for insert to authenticated
    with check (
        bucket_id = 'campaign-assets'
        and exists (
            select 1 from public.organization_memberships membership
            where membership.organization_id::text = (storage.foldername(name))[1]
              and membership.user_id = (select auth.uid())
              and membership.role in ('owner', 'admin', 'editor')
        )
    );

create policy campaign_assets_members_update
    on storage.objects for update to authenticated
    using (
        bucket_id = 'campaign-assets'
        and exists (
            select 1 from public.organization_memberships membership
            where membership.organization_id::text = (storage.foldername(name))[1]
              and membership.user_id = (select auth.uid())
              and membership.role in ('owner', 'admin', 'editor')
        )
    )
    with check (
        bucket_id = 'campaign-assets'
        and exists (
            select 1 from public.organization_memberships membership
            where membership.organization_id::text = (storage.foldername(name))[1]
              and membership.user_id = (select auth.uid())
              and membership.role in ('owner', 'admin', 'editor')
        )
    );

create policy campaign_assets_members_delete
    on storage.objects for delete to authenticated
    using (
        bucket_id = 'campaign-assets'
        and exists (
            select 1 from public.organization_memberships membership
            where membership.organization_id::text = (storage.foldername(name))[1]
              and membership.user_id = (select auth.uid())
              and membership.role in ('owner', 'admin')
        )
    );
