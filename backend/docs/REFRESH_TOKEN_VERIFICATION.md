# Access token refresh verification

## Summary

- **Access token**: 15-minute expiry; stored in `sessionStorage` and Redux; sent as `Authorization: Bearer <token>`.
- **Refresh token**: 7-day expiry; stored in HTTP-only cookie `refreshToken`; sent automatically with `withCredentials: true`.
- On **401**, the frontend calls `POST /auth/refresh` (with the cookie); the backend returns a new access token (and sets a new refresh cookie). The client then retries the failed request and persists the new access token.

## Manual verification (browser)

1. **Start backend and frontend** (and Redis).
2. **Log in** in the app.
3. **Optional – shorten access token for quick test**: In `backend/src/modules/auth/authService.ts`, temporarily change `expiresIn` in `signAccessToken` to `"1m"` (1 minute), restart the backend.
4. **Trigger refresh**:
   - Wait until the access token has expired (e.g. 1 minute if you changed it, or 15 minutes otherwise), **or**
   - In DevTools → Application → Session Storage, delete `accessToken` (leave `user`), then trigger any authenticated request (e.g. navigate to a protected page or click something that calls the API). The app will get 401, call `/auth/refresh`, get a new token, retry, and update `sessionStorage` and Redux.
5. **Check**:
   - Network tab: after a 401 you should see `POST .../auth/refresh` (200), then the retried request (200).
   - Session Storage: `accessToken` should be present again (new value).
   - App should continue to work without redirect to login (unless the refresh token was also invalid).

## Manual verification (curl)

Base URL below: `http://localhost:4000` (or your API URL). Replace with your backend base and a valid user.

```bash
# 1. Login (saves cookies to cookies.txt; response has accessToken in body)
curl -c cookies.txt -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@coe.vantage","password":"your-seed-password"}'

# 2. Use access token for a protected route (copy accessToken from step 1 into TOKEN)
export TOKEN="<paste-access-token-here>"
curl -b cookies.txt -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/users

# 3. Refresh (uses cookie only; no Authorization header)
curl -b cookies.txt -c cookies.txt -X POST http://localhost:4000/api/auth/refresh

# 4. Use the NEW access token from step 3 response for a protected route
export NEW_TOKEN="<paste-new-access-token-from-step-3>"
curl -b cookies.txt -H "Authorization: Bearer $NEW_TOKEN" http://localhost:4000/api/users
```

If step 3 returns 200 with `{ "accessToken": "..." }` and step 4 returns 200 with user list, refresh is working.

## Client-side fix (already applied)

After a successful refresh, the client now:

1. Updates `apiClient.defaults.headers.common.Authorization` with the new token.
2. Writes the new token to `sessionStorage.setItem("accessToken", ...)`.
3. Dispatches `authTokenRefreshed` so the Redux store updates via `setAccessTokenOnly`.

That way the next request and any component reading from Redux see the new token.
