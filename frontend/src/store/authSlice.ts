import { createSlice } from "@reduxjs/toolkit";
import type { User, ExperimentalFeaturesPreference } from "../types/auth";
import { initViewCollege, resetViewCollege } from "../utils/collegeView";
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
      initViewCollege(action.payload.user.id);
    },
    setAccessTokenOnly(state, action: { payload: string }) {
      state.accessToken = action.payload;
      sessionStorage.setItem("accessToken", action.payload);
      setAccessToken(action.payload);
    },
    setUserExperimentalFeatures(state, action: { payload: ExperimentalFeaturesPreference }) {
      if (!state.user) return;
      state.user.experimentalFeatures = action.payload;
      sessionStorage.setItem("user", JSON.stringify(state.user));
    },
    setProfile(state, action: { payload: { name?: string; avatarVersion?: number | null } }) {
      if (!state.user) return;
      if (action.payload.name !== undefined) state.user.name = action.payload.name;
      if (action.payload.avatarVersion !== undefined) state.user.avatarVersion = action.payload.avatarVersion;
      sessionStorage.setItem("user", JSON.stringify(state.user));
    },
    logout(state) {
      state.user = null;
      state.accessToken = null;
      sessionStorage.removeItem("accessToken");
      sessionStorage.removeItem("user");
      clearAccessToken();
      resetViewCollege();
    },
  },
});

export const { setAuth, setAccessTokenOnly, setUserExperimentalFeatures, setProfile, logout } = authSlice.actions;
export default authSlice.reducer;
