import { createSlice } from "@reduxjs/toolkit";
import type { User } from "../types/auth";
import { setAccessToken, clearAccessToken } from "../api/apiClient";

interface AuthState {
  user: User | null;
  accessToken: string | null;
}

const token = sessionStorage.getItem("accessToken");

const initialState: AuthState = {
  user: (() => {
    try {
      const u = sessionStorage.getItem("user");
      return u ? (JSON.parse(u) as User) : null;
    } catch {
      return null;
    }
  })(),
  accessToken: token,
};

if (token) setAccessToken(token);

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setAuth(state, action: { payload: { user: User; accessToken: string } }) {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      sessionStorage.setItem("accessToken", action.payload.accessToken);
      sessionStorage.setItem("user", JSON.stringify(action.payload.user));
      setAccessToken(action.payload.accessToken);
    },
    setAccessTokenOnly(state, action: { payload: string }) {
      state.accessToken = action.payload;
      sessionStorage.setItem("accessToken", action.payload);
      setAccessToken(action.payload);
    },
    logout(state) {
      state.user = null;
      state.accessToken = null;
      sessionStorage.removeItem("accessToken");
      sessionStorage.removeItem("user");
      clearAccessToken();
    },
  },
});

export const { setAuth, setAccessTokenOnly, logout } = authSlice.actions;
export default authSlice.reducer;
