"use client";

import { createContext, useContext } from "react";

export type AdminRole = "admin" | "admin_viewer" | null;

type AdminRoleContextValue = {
  loading: boolean;
  userId: string | null;
  email: string | null;
  role: AdminRole;
  isAdmin: boolean;
  isViewer: boolean;
  canEdit: boolean;
};

const AdminRoleContext = createContext<AdminRoleContextValue>({
  loading: true,
  userId: null,
  email: null,
  role: null,
  isAdmin: false,
  isViewer: false,
  canEdit: false,
});

export function AdminRoleProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: AdminRoleContextValue;
}) {
  return <AdminRoleContext.Provider value={value}>{children}</AdminRoleContext.Provider>;
}

export function useAdminRole() {
  return useContext(AdminRoleContext);
}
