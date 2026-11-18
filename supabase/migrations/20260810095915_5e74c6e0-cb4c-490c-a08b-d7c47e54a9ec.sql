update public.line_credentials
set token_last4 = right(channel_access_token, 4),
    secret_last4 = right(channel_secret, 4)
where channel_access_token is not null;