import { create } from 'zustand'

interface AuthState {
  accessToken: string | null
  role: string | null
  email: string | null
  setAuth: (token: string, role: string, email: string) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  role: null,
  email: null,
  setAuth: (token, role, email) => set({ accessToken: token, role, email }),
  clearAuth: () => set({ accessToken: null, role: null, email: null }),
}))