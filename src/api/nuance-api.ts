import { useWallet } from "@/composables/useWallet";
import { useNuanceEnv } from "@/composables/useNuanceEnv";

export interface PublishPostArgs {
  content: string;
  author?: string;
  executorAddress: string;
  grantee?: string;
  memo?: string;
}

export interface AppendPostArgs {
  postId: number;
  content: string;
  executorAddress: string;
  grantee?: string;
  memo?: string;
}

export interface EditProfileArgs {
  content: string;
  author?: string;
  executorAddress: string;
  grantee?: string;
  memo?: string;
}

export interface LinkPageArgs {
  path: string;
  postId: number;
  author: string;
  title?: string;
  executorAddress: string;
  grantee?: string;
  memo?: string;
}

export interface UnlinkPageArgs {
  path: string;
  author?: string;
  executorAddress: string;
  grantee?: string;
  memo?: string;
}

export interface RateTagArgs {
  tag: string;
  postId: number;
  rate: "up" | "down";
  amountUdys: number; // micro
  contributor?: string;
  executorAddress: string;
  grantee?: string;
  memo?: string;
}

export interface RateReplyArgs {
  postId: number;
  replyPostId: number;
  rate: "up" | "down";
  amountUdys: number; // micro
  executorAddress: string;
  grantee?: string;
  memo?: string;
}

export interface AddTagRewardsArgs {
  tag: string;
  amountUdys: number; // micro
  contributor?: string;
  executorAddress: string;
  grantee?: string;
  memo?: string;
}

export interface ClaimTagRewardsArgs {
  tag: string;
  hotIndex: number;
  executorAddress: string;
  grantee?: string;
  memo?: string;
}

export interface ClaimReplyRewardsArgs {
  postId: number;
  hotIndex: number;
  executorAddress: string;
  grantee?: string;
  memo?: string;
}

function buildUdysSend(from: string, to: string, amountUdys: number) {
  return {
    "@type": "/cosmos.bank.v1beta1.MsgSend",
    from_address: from,
    to_address: to,
    amount: [{ denom: "udys", amount: String(amountUdys) }],
  };
}

type WalletRunDysonArgs = {
  scriptAddress: string;
  functionName: string;
  args?: string;
  kwargs?: string;
  extraCode?: string;
  attachedMsg?: unknown[];
  memo?: string;
  gasLimit?: number | "auto";
  simulate?: boolean;
  executorAddress: string;
  grantee?: string;
};

type WalletRunDysonResult = {
  kind?: string;
  success: boolean;
  scriptResponse: unknown;
  rawSendMsgsResponse: unknown;
};

export function useNuanceApi() {
  const { runDysonScript } = useWallet() as unknown as {
    runDysonScript: (a: WalletRunDysonArgs) => Promise<WalletRunDysonResult>;
  };
  const { nuanceOwner } = useNuanceEnv();

  const run = (a: WalletRunDysonArgs) => runDysonScript(a);

  async function publishPost(args: PublishPostArgs) {
    const { content, author = "", executorAddress, grantee, memo = "" } = args;
    return run({
      scriptAddress: nuanceOwner,
      functionName: "publish_post",
      args: JSON.stringify([content]),
      kwargs: JSON.stringify({ author }),
      memo,
      gasLimit: "auto",
      executorAddress,
      grantee,
      simulate: false,
    });
  }

  async function appendToPost(args: AppendPostArgs) {
    const { postId, content, executorAddress, grantee, memo = "" } = args;
    return run({
      scriptAddress: nuanceOwner,
      functionName: "append_to_post",
      args: JSON.stringify([postId, content]),
      memo,
      gasLimit: "auto",
      executorAddress,
      grantee,
      simulate: false,
    });
  }

  async function editAuthorProfile(args: EditProfileArgs) {
    const { content, author = "", executorAddress, grantee, memo = "" } = args;
    return run({
      scriptAddress: nuanceOwner,
      functionName: "edit_author_profile",
      args: JSON.stringify([content]),
      kwargs: JSON.stringify({ author }),
      memo,
      gasLimit: "auto",
      executorAddress,
      grantee,
      simulate: false,
    });
  }

  async function linkPage(args: LinkPageArgs) {
    const {
      path,
      postId,
      author,
      title = "",
      executorAddress,
      grantee,
      memo = "",
    } = args;
    return run({
      scriptAddress: nuanceOwner,
      functionName: "link_page",
      args: JSON.stringify([path, postId, author]),
      kwargs: JSON.stringify({ title }),
      memo,
      gasLimit: "auto",
      executorAddress,
      grantee,
      simulate: false,
    });
  }

  async function unlinkPage(args: UnlinkPageArgs) {
    const { path, author = "", executorAddress, grantee, memo = "" } = args;
    return run({
      scriptAddress: nuanceOwner,
      functionName: "unlink_page",
      args: JSON.stringify([path]),
      kwargs: JSON.stringify({ author }),
      memo,
      gasLimit: "auto",
      executorAddress,
      grantee,
      simulate: false,
    });
  }

  async function rateTag(args: RateTagArgs) {
    const {
      tag,
      postId,
      rate,
      amountUdys,
      contributor = "",
      executorAddress,
      grantee,
      memo = "",
    } = args;
    const attached = [
      buildUdysSend(executorAddress, nuanceOwner, amountUdys),
    ] as unknown[];
    return run({
      scriptAddress: nuanceOwner,
      functionName: "rate_tag",
      args: JSON.stringify([tag, postId, rate]),
      kwargs: JSON.stringify({ contributor }),
      attachedMsg: attached,
      memo,
      gasLimit: "auto",
      executorAddress,
      grantee,
      simulate: false,
    });
  }

  async function rateReply(args: RateReplyArgs) {
    const {
      postId,
      replyPostId,
      rate,
      amountUdys,
      executorAddress,
      grantee,
      memo = "",
    } = args;
    const attached = [
      buildUdysSend(executorAddress, nuanceOwner, amountUdys),
    ] as unknown[];
    return run({
      scriptAddress: nuanceOwner,
      functionName: "rate_reply",
      args: JSON.stringify([postId, replyPostId, rate]),
      attachedMsg: attached,
      memo,
      gasLimit: "auto",
      executorAddress,
      grantee,
      simulate: false,
    });
  }

  async function addTagRewards(args: AddTagRewardsArgs) {
    const {
      tag,
      amountUdys,
      contributor = "",
      executorAddress,
      grantee,
      memo = "",
    } = args;
    const attached = [
      buildUdysSend(executorAddress, nuanceOwner, amountUdys),
    ] as unknown[];
    return run({
      scriptAddress: nuanceOwner,
      functionName: "add_tag_rewards",
      args: JSON.stringify([tag]),
      kwargs: JSON.stringify({ contributor }),
      attachedMsg: attached,
      memo,
      gasLimit: "auto",
      executorAddress,
      grantee,
      simulate: false,
    });
  }

  async function claimTagRewards(args: ClaimTagRewardsArgs) {
    const { tag, hotIndex, executorAddress, grantee, memo = "" } = args;
    return run({
      scriptAddress: nuanceOwner,
      functionName: "claim_tag_rewards",
      args: JSON.stringify([tag, hotIndex]),
      memo,
      gasLimit: "auto",
      executorAddress,
      grantee,
      simulate: false,
    });
  }

  async function claimReplyRewards(args: ClaimReplyRewardsArgs) {
    const { postId, hotIndex, executorAddress, grantee, memo = "" } = args;
    return run({
      scriptAddress: nuanceOwner,
      functionName: "claim_reply_rewards",
      args: JSON.stringify([postId, hotIndex]),
      memo,
      gasLimit: "auto",
      executorAddress,
      grantee,
      simulate: false,
    });
  }

  return {
    publishPost,
    appendToPost,
    editAuthorProfile,
    linkPage,
    unlinkPage,
    rateTag,
    rateReply,
    addTagRewards,
    claimTagRewards,
    claimReplyRewards,
  };
}
