import {
  FileText,
  Code,
  Tag,
  Banknote,
  Database,
  ShieldCheck,
  SquareStack,
  KeyRound,
} from 'lucide-vue-next'

export interface AddressTab {
  name: string
  label: string
  icon: any
}

export const addressTabs: AddressTab[] = [
  { name: 'AddressSummary', label: 'Summary', icon: FileText },
  { name: 'AddressScript', label: 'Script', icon: Code },
  { name: 'AddressNames', label: 'Names', icon: Tag },
  { name: 'AddressCoins', label: 'Coins', icon: Banknote },
  { name: 'AddressStorage', label: 'Storage', icon: Database },
  { name: 'AddressStaking', label: 'Staking', icon: ShieldCheck },
  { name: 'AddressNFTs', label: 'NFTs', icon: SquareStack },
  { name: 'AddressAuthz', label: 'Authz', icon: KeyRound },
]
