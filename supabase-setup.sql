-- Kullanıcıların günlük kullanım hakkını ve limitini tutan tablo.
-- Görsel için 10 limit, sohbet için 99999 (sınırsız) limit belirlendi.

create table if not exists public.user_limits (
  id uuid references auth.users(id) primary key,
  email text not null,
  daily_image_limit integer not null default 10,
  image_usage_today integer not null default 0,
  daily_chat_limit integer not null default 99999,
  chat_usage_today integer not null default 0,
  last_used_date date not null default current_date,
  is_admin boolean not null default false,
  created_at timestamp with time zone default now()
);

-- Yeni kullanıcı kayıt olduğunda otomatik olarak bu tabloya satır eklensin.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_limits (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Güvenlik: kullanıcılar sadece kendi satırını görebilsin.
alter table public.user_limits enable row level security;

create policy "Kullanıcı kendi satırını görebilir"
  on public.user_limits for select
  using (auth.uid() = id);
