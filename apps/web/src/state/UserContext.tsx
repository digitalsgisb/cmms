import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@sugi-cmms/shared";
import { api } from "../api/client";

interface UserContextValue {
  users: User[];
  currentUser: User | null;
  loadingUsers: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
  setCurrentUserId: (id: string) => void;
  refreshUsers: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | null>(null);
const sessionUserKey = "sugi-cmms-auth-user-id-v2";

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserIdState] = useState(() => localStorage.getItem(sessionUserKey) || "");
  const [loadingUsers, setLoadingUsers] = useState(true);

  async function refreshUsers() {
    setLoadingUsers(true);
    try {
      const nextUsers = await api.users();
      setUsers(nextUsers);
    } finally {
      setLoadingUsers(false);
    }
  }

  function setCurrentUserId(id: string) {
    localStorage.setItem(sessionUserKey, id);
    setCurrentUserIdState(id);
  }

  async function login(username: string, password: string) {
    const user = await api.login(username, password);
    setCurrentUserId(user.id);
    setUsers((current) => {
      const exists = current.some((item) => item.id === user.id);
      return exists ? current.map((item) => (item.id === user.id ? user : item)) : [user, ...current];
    });
    return user;
  }

  function logout() {
    localStorage.removeItem(sessionUserKey);
    setCurrentUserIdState("");
  }

  useEffect(() => {
    refreshUsers().catch(console.error);
  }, []);

  const currentUser = useMemo(() => {
    return users.find((user) => user.id === currentUserId) || null;
  }, [currentUserId, users]);
  const isAuthenticated = Boolean(currentUser);

  const value = useMemo<UserContextValue>(
    () => ({ users, currentUser, loadingUsers, isAuthenticated, login, logout, setCurrentUserId, refreshUsers }),
    [users, currentUser, loadingUsers, isAuthenticated]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useCurrentUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useCurrentUser must be used inside UserProvider");
  }

  return context;
}
