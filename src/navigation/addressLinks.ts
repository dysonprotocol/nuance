import type { Component } from "vue";

export interface AddressLink {
  text: string;
  to: any;
  icon?: Component;
  iconClass?: string;
}

export function getAddressLinks(address: string): AddressLink[] {
  return [
    {
      text: "Author Posts",
      to: { name: "NuanceAuthorPosts", params: { author: address } },
    },
    {
      text: "Recent",
      to: { name: "NuanceRecent" },
    },
  ];
}
