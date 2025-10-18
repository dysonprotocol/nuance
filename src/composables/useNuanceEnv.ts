import { ref, computed } from "vue";
import { useRepo } from "pinia-orm";
import { useAxiosRepo } from "@pinia-orm/axios";
import { NameResolution } from "@/orm/models/nameservice/NameResolution";

export function useNuanceEnv() {
  return { nuanceOwner: import.meta.env.VITE_NUANCE_OWNER };
}
