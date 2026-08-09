import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";

export interface Address {
  id: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
  created_at: string;
}

export interface AddressCreate {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
}

export const addressKeys = {
  list: () => ["addresses"] as const,
};

export function useAddresses() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  return useQuery<Address[]>({
    queryKey: addressKeys.list(),
    queryFn: () => api.get("/addresses").then((r) => r.data),
    enabled: isAuthenticated,
  });
}

export function useCreateAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AddressCreate) => api.post("/addresses", data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: addressKeys.list() }),
  });
}

export function useSetDefaultAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/addresses/${id}/set-default`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: addressKeys.list() }),
  });
}

export function useDeleteAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/addresses/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: addressKeys.list() }),
  });
}
