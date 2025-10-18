#!/usr/bin/env python3
"""
Minimal single-run content generator using dysond public functions only.

Features:
- Uses local keys: alice, bob, charlie
- Creates markdown posts with random subset of active tags
- Randomly replies to existing posts
- Randomly rates existing tags on existing posts up or down

Usage:
    python generate_content.py <account_name> [--author <dys_name>]

Arguments:
    account_name: Dysond key name to use for signing transactions
    --author: Optional dys name to use as the author of posts (defaults to account_name)

Assumptions (override via flags if needed):
- Public functions exposed by the on-chain script:
  * create_post(title: str, body: str, tags: list[str]) -> { post_id: str/int }
  * list_posts() -> { posts: [{ id, tags: list[str], ... }, ...] }
  * reply_to_post(parent_post_id: str/int, body: str, tags: list[str]) -> { reply_id: str/int }
  * rate_tag(post_id: str/int, tag: str, delta: int) -> any

No --extra-code is used; only public functions are invoked.
"""

from __future__ import annotations
import json
import os
import random
import subprocess
import sys
import time
import urllib.request
from typing import Any, Dict, List, Optional, Tuple
import argparse


ACTIVE_TAGS = ["dashboard", "foo", "bar", "baz"]
LOREM_URL = "https://jaspervdj.be/lorem-markdownum/markdown.txt"

# Hard-coded configuration (no CLI flags)
SCRIPT_ADDRESS = "dys212hg702z4rzdms6jsc8rruxktyac3gpyk7mh0za"
FN_CREATE = "publish_post"
FN_REPLY = "append_to_post"
FN_RATE = "rate_tag"
NUM_POSTS_PER_USER = 1
SEED: Optional[int] = None  # Set to an integer for reproducibility, or None for random
VERBOSE = True


def log_info(message: str) -> None:
    if VERBOSE:
        print(f"[INFO] {message}")


def log_warn(message: str) -> None:
    print(f"[WARN] {message}", file=sys.stderr)


def run(cmd: List[str], check: bool = False) -> Tuple[int, str, str]:
    """Run a command and return (rc, stdout, stderr)."""
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if check and proc.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{proc.stderr}")
    return proc.returncode, proc.stdout, proc.stderr


def dysond_keys_show_address(name: str) -> Optional[str]:
    rc, out, _ = run(["dysond", "keys", "show", "-a", name])
    if rc == 0:
        return "".join(out.splitlines()).strip()
    return None







def build_script_target_args(script_address: Optional[str]) -> List[str]:
    args: List[str] = []
    if script_address:
        args += ["--script-address", script_address]
    return args


# Rewards claim threshold (in udys)
THRESHOLD_UDYS = 1_000_000


def storage_list_posts(owner_address: str) -> List[Dict[str, Any]]:
    """List posts directly from storage using dysond storage list."""
    rc, out, err = run([
        "dysond",
        "query",
        "storage",
        "list",
        owner_address,
        "--index-prefix",
        "posts/",
        "-o",
        "json",
    ])
    if rc != 0:
        raise RuntimeError(f"storage list failed: {(err or '').strip()}")
    try:
        top = json.loads(out)
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"failed to decode storage list response: {e}")
    posts: List[Dict[str, Any]] = []
    for item in top.get("entries", []) or []:
        try:
            data = json.loads(item.get("data", "{}"))
            assert isinstance(data, dict), "entry data must be a JSON object"
            assert "post_id" in data, "post entry missing 'post_id'"
            # Minimal shape check
            if isinstance(data, dict) and ("post_id" in data or "id" in data):
                posts.append(data)
        except Exception as e:
            raise AssertionError(f"invalid post entry: {e}")
    return posts


def storage_list_available_rewards(owner_address: str, namespace: str, denom: str = "udys") -> List[Dict[str, Any]]:
    """List available rewards entries for a namespace (tags|replies)."""
    rc, out, err = run([
        "dysond",
        "query",
        "storage",
        "list",
        owner_address,
        "--index-prefix",
        f"available_rewards/{namespace}/{denom}/",
        "-o",
        "json",
    ])
    if rc != 0:
        log_warn(f"failed to list available rewards for {namespace}: {(err or '').strip()}")
        return []
    try:
        top = json.loads(out)
    except Exception as e:  # noqa: BLE001
        log_warn(f"failed to decode rewards list for {namespace}: {e}")
        return []
    results: List[Dict[str, Any]] = []
    for item in top.get("entries", []) or []:
        try:
            data = json.loads(item.get("data", "{}"))
            # expected: { tag_name, denom, amount }
            if not isinstance(data, dict):
                continue
            data["amount"] = int(str(data.get("amount", 0)))
            data["namespace"] = namespace
            results.append(data)
        except Exception:
            continue
    # sort by amount desc
    results.sort(key=lambda d: d.get("amount", 0), reverse=True)
    return results


def storage_get_post_author(owner_address: str, post_id: int) -> Optional[str]:
    """Return the author stored for a given post id, or None."""
    index = f"posts/{_format_id_15(int(post_id))}"
    rc, out, err = run([
        "dysond",
        "query",
        "storage",
        "get",
        owner_address,
        "--index",
        index,
        "-o",
        "json",
    ])
    if rc != 0:
        return None
    try:
        top = json.loads(out)
        data = json.loads((top.get("entry") or {}).get("data", "{}"))
        author = data.get("author")
        return author if isinstance(author, str) and author else None
    except Exception:
        return None


def storage_list_hot_posts_for_tag(owner_address: str, tag_name: str, limit: int = 10) -> List[int]:
    """List top hot posts for a given tag from storage (sorted by hot_rating desc)."""
    rc, out, err = run([
        "dysond",
        "query",
        "storage",
        "list",
        owner_address,
        "--index-prefix",
        f"rate/tags/{tag_name}/hot/",
        "-o",
        "json",
    ])
    if rc != 0:
        log_warn(f"failed to list hot posts for tag '{tag_name}': {(err or '').strip()}")
        return []
    try:
        top = json.loads(out)
    except Exception as e:  # noqa: BLE001
        log_warn(f"failed to decode hot posts for tag '{tag_name}': {e}")
        return []
    rows: List[Tuple[float, int]] = []
    for item in top.get("entries", []) or []:
        try:
            data = json.loads(item.get("data", "{}"))
            pid = int(data.get("id")) if data.get("id") is not None else None
            hot = float(data.get("hot_rating", 0))
            if pid is not None:
                rows.append((hot, pid))
        except Exception:
            continue
    rows.sort(key=lambda t: t[0], reverse=True)
    return [pid for _, pid in rows[: max(0, int(limit))]]


def storage_list_hot_replies(owner_address: str, post_id: int, limit: int = 10) -> List[int]:
    """List top hot replies for a given post id from storage (sorted by hot_rating desc)."""
    rc, out, err = run([
        "dysond",
        "query",
        "storage",
        "list",
        owner_address,
        "--index-prefix",
        f"rate/replies/{_format_id_15(int(post_id))}/hot/",
        "-o",
        "json",
    ])
    if rc != 0:
        log_warn(f"failed to list hot replies for post {post_id}: {(err or '').strip()}")
        return []
    try:
        top = json.loads(out)
    except Exception as e:  # noqa: BLE001
        log_warn(f"failed to decode hot replies for post {post_id}: {e}")
        return []
    rows: List[Tuple[float, int]] = []
    for item in top.get("entries", []) or []:
        try:
            data = json.loads(item.get("data", "{}"))
            rid = int(data.get("id")) if data.get("id") is not None else None
            hot = float(data.get("hot_rating", 0))
            if rid is not None:
                rows.append((hot, rid))
        except Exception:
            continue
    rows.sort(key=lambda t: t[0], reverse=True)
    return [rid for _, rid in rows[: max(0, int(limit))]]


def claim_tag_reward(from_name: str, script_address: Optional[str], tag_name: str, hot_index: int) -> bool:
    try:
        res = tx_script_exec(
            from_name=from_name,
            script_address=script_address,
            function_name="claim_tag_rewards",
            kwargs_dict={"tag_name": tag_name, "hot_index": int(hot_index)},
        )
        return bool(res.get("ok"))
    except Exception as e:  # noqa: BLE001
        log_warn(f"claim_tag_rewards failed for tag '{tag_name}' at index {hot_index}: {e}")
        return False


def claim_reply_reward(from_name: str, script_address: Optional[str], post_id: int, hot_index: int) -> bool:
    try:
        res = tx_script_exec(
            from_name=from_name,
            script_address=script_address,
            function_name="claim_reply_rewards",
            kwargs_dict={"post_id": int(post_id), "hot_index": int(hot_index)},
        )
        return bool(res.get("ok"))
    except Exception as e:  # noqa: BLE001
        log_warn(f"claim_reply_rewards failed for post {post_id} at index {hot_index}: {e}")
        return False


def claim_available_rewards(
    from_name: str,
    from_address: str,
    reader_exec_addr: str,
    script_address: Optional[str],
    threshold_udys: int = THRESHOLD_UDYS,
) -> Tuple[int, int]:
    """Claim rewards over threshold for tags and replies.

    Returns (claimed_tags, claimed_replies) counters.
    """
    claimed_tags = 0
    claimed_replies = 0

    # TAGS namespace
    tag_rewards = storage_list_available_rewards(script_address or "", "tags", "udys")
    eligible_tags = [r for r in tag_rewards if r.get("amount", 0) > threshold_udys]
    if eligible_tags:
        log_info(f"Found {len(eligible_tags)} tag reward pools > {threshold_udys} udys")
    for r in eligible_tags:
        tag_name = r.get("tag_name")
        if not isinstance(tag_name, str) or not tag_name:
            continue
        hot_posts = storage_list_hot_posts_for_tag(script_address or "", tag_name, 10)
        if not hot_posts:
            continue
        # Try only indices where the post author is this user
        for idx, pid in enumerate(hot_posts[:10]):
            author = storage_get_post_author(script_address or "", pid)
            if author != from_address:
                continue
            log_info(f"Claiming tag rewards for '{tag_name}' at hot_index={idx} (post {pid})")
            if claim_tag_reward(from_name, script_address, tag_name, idx):
                claimed_tags += 1

    # REPLIES namespace
    reply_rewards = storage_list_available_rewards(script_address or "", "replies", "udys")
    eligible_replies = [r for r in reply_rewards if r.get("amount", 0) > threshold_udys]
    if eligible_replies:
        log_info(f"Found {len(eligible_replies)} reply reward pools > {threshold_udys} udys")
    for r in eligible_replies:
        tag_name = r.get("tag_name")  # this is formatted post id (015) for replies
        try:
            post_id = int(str(tag_name))
        except Exception:
            continue
        hot_replies = storage_list_hot_replies(script_address or "", post_id, 10)
        if not hot_replies:
            continue
        for idx, rid in enumerate(hot_replies[:10]):
            # Only try for replies authored by this user
            author = storage_get_post_author(script_address or "", rid)
            if author != from_address:
                continue
            log_info(f"Claiming reply rewards for post {post_id} at hot_index={idx} (reply {rid})")
            if claim_reply_reward(from_name, script_address, post_id, idx):
                claimed_replies += 1

    return claimed_tags, claimed_replies


def tx_script_exec(
    from_name: str,
    script_address: Optional[str],
    function_name: str,
    args_list: Optional[List[Any]] = None,
    kwargs_dict: Optional[Dict[str, Any]] = None,
    attached_messages: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Execute a public function with dysond tx script exec and wait for inclusion.

    Raises RuntimeError/ValueError on any failure; callers should not need to
    inspect return values for errors.
    """
    args_json = json.dumps(args_list or [], ensure_ascii=False)
    kwargs_json = json.dumps(kwargs_dict or {}, ensure_ascii=False)
    base_cmd = [
        "dysond",
        "tx",
        "script",
        "exec",
        "--from",
        from_name,
        "--function-name",
        function_name,
        "--args",
        args_json,
        "--kwargs",
        kwargs_json,
        "-y",
        "-o",
        "json",
        "--gas",
        "auto",
    ] + build_script_target_args(script_address)

    # Attach optional messages (e.g., bank MsgSend for rate_tag coins)
    if attached_messages:
        for msg in attached_messages:
            base_cmd += ["--attached-message", json.dumps(msg, ensure_ascii=False)]

    rc, out, err = run(base_cmd)
    if rc != 0:
        raise RuntimeError(f"script exec failed: {function_name}: {err.strip()}")

    try:
        tx_submit = json.loads(out)
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"failed to decode submit json: {e}")

    txhash = tx_submit.get("txhash") or tx_submit.get("txHash")
    if not txhash:
        raise RuntimeError("missing txhash in submit response")

    # Wait for inclusion
    rc2, out2, err2 = run(["dysond", "query", "wait-tx", txhash, "-o", "json"])
    if rc2 != 0:
        raise RuntimeError(f"wait-tx failed: {txhash}: {err2.strip()}")

    try:
        final = json.loads(out2)
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"failed to decode wait json: {e}")

    return {"ok": True, "submit": tx_submit, "final": final}


def parse_exec_return(final_tx: Dict[str, Any]) -> Optional[Any]:
    """Extract the script function return payload from wait-tx JSON (best-effort)."""
    try:
        for ev in final_tx.get("events", []) or []:
            if ev.get("type", "").endswith("EventExecScript"):
                for attr in ev.get("attributes", []) or []:
                    if attr.get("key") == "response":
                        resp = json.loads(attr.get("value", "{}"))
                        result_str = resp.get("result")
                        if not result_str:
                            continue
                        outer = json.loads(result_str)
                        if outer.get("exception"):
                            raise RuntimeError(f"Script execution failed: {outer.get('exception')}")
                        return outer.get("result")
    except Exception:
        return None
    return None


def query_script_run(
    executor_address: str,
    script_address: Optional[str],
    function_name: str,
    args_list: Optional[List[Any]] = None,
) -> Dict[str, Any]:
    args: List[str] = [
        "dysond",
        "query",
        "script",
        "run",
        "--executor-address",
        executor_address,
        "--function-name",
        function_name,
        "-o",
        "json",
    ] + build_script_target_args(script_address)

    if args_list is not None:
        args_json = json.dumps(args_list, ensure_ascii=False)
        args += ["--args", args_json]

    rc, out, err = run(args)
    if rc != 0:
        return {"ok": False, "stderr": err}
    try:
        top = json.loads(out)
        inner = json.loads(top.get("result", "{}"))
        return {"ok": True, "raw": top, "result": inner.get("result")}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "raw": out}


def list_posts(
    reader_exec_addr: str,
    script_address: Optional[str],
    fn_list: str,
) -> List[Dict[str, Any]]:
    q = query_script_run(reader_exec_addr, script_address, fn_list)
    if not q.get("ok"):
        return []
    res = q.get("result")
    if isinstance(res, dict) and "posts" in res:
        posts = res.get("posts") or []
        return posts if isinstance(posts, list) else []
    if isinstance(res, list):
        return res
    return []


def _format_id_15(n: int) -> str:
    return f"{int(n):015}"


def storage_list_existing_tags(owner_address: str, post_id: int) -> List[str]:
    """List existing tag names for a given post from reverse index (best)."""
    rc, out, err = run([
        "dysond",
        "query",
        "storage",
        "list",
        owner_address,
        "--index-prefix",
        f"reverse_rates/tags/{_format_id_15(int(post_id))}/best/",
        "-o",
        "json",
    ])
    if rc != 0:
        return []
    try:
        top = json.loads(out)
    except Exception:
        return []
    tags: List[str] = []
    for item in top.get("entries", []) or []:
        try:
            data = json.loads(item.get("data", "{}"))
            tag_name = data.get("tag_name")
            if isinstance(tag_name, str) and tag_name:
                tags.append(tag_name)
        except Exception:
            continue
    return tags


def main() -> int:
    rng = random.Random(SEED if SEED is not None else time.time_ns())

    parser = argparse.ArgumentParser(description="Generate content for Nuance forum")
    parser.add_argument("account_name", help="Dysond key name to use for signing transactions")
    parser.add_argument("--author", help="Dys name to use as the author of posts (defaults to account_name)")

    args = parser.parse_args()

    account_name = args.account_name.strip()
    author_name = args.author.strip() if args.author else None
    addr = dysond_keys_show_address(account_name)
    if not addr:
        print(f"missing local key for '{account_name}' (dysond keys show)", file=sys.stderr)
        return 1

    users: List[str] = [account_name]
    user_addresses: Dict[str, str] = {account_name: addr}

    author_display = f" (author: {author_name})" if author_name else ""
    log_info(
        f"Resolved user: {account_name}({addr[:8]}...){author_display}"
    )

    # Use alice address for read-only queries (executor for run)
    reader_exec_addr = user_addresses[users[0]]

    # Markdown fetching will be done per post

    # Pre-read existing posts (best-effort) via storage
    posts: List[Dict[str, Any]] = storage_list_posts(SCRIPT_ADDRESS)
    log_info(f"Preloaded {len(posts)} existing posts via storage")

    created_posts: Dict[str, List[Any]] = {u: [] for u in users}
    created_ids: Dict[str, List[Any]] = {u: [] for u in users}
    claimed_summary: Dict[str, Dict[str, int]] = {u: {"tags": 0, "replies": 0} for u in users}
    replies_made = 0
    ratings_made = 0

    # Create posts for the provided user only
    for u in users:
        n = max(0, NUM_POSTS_PER_USER)
        for _ in range(n):
            # Fetch new lorem markdown for each post
            try:
                with urllib.request.urlopen(LOREM_URL, timeout=10) as resp:
                    lorem_content = resp.read().decode("utf-8", errors="replace")
            except Exception as e:  # noqa: BLE001
                raise RuntimeError(f"failed to fetch lorem markdown: {e}")
            content = lorem_content
            # Combine posting and replying: embed a reply to a random existing post
            parent_post_id: Optional[int] = None
            if posts:
                parent_post_id = rng.randint(1, len(posts))
                content = content.replace('\n\n', f'\n\n/{parent_post_id}\n\n', 1)
                log_info(f"[{u}] Publishing post (replying to {parent_post_id})")
            else:
                log_info(f"[{u}] Publishing post")
            # Prepare kwargs for publish_post
            kwargs_dict = {"content": content}
            if author_name:
                kwargs_dict["author"] = author_name

            res = tx_script_exec(
                from_name=u,
                script_address=SCRIPT_ADDRESS,
                function_name=FN_CREATE,
                # publish_post(content: TEXTAREA, author: str = "")
                kwargs_dict=kwargs_dict,
            )
            if not res.get("ok"):
                # tx_script_exec raises on failure; this branch handles the rare
                # case where ok True but no final result
                raise RuntimeError(f"[{u}] publish returned not ok")
            # Assume post_id is sequential, starting from len(posts) + 1
            new_id = len(posts) + 1
            created_posts[u].append(new_id)
            posts.append({"id": new_id, "tags": []})
            log_info(f"[{u}] Published post id={new_id}")
            created_ids[u].append(new_id)
            # If it fails, keep going (super simple)

            # Immediately tag the new post with each ACTIVE_TAGS entry (as author)
            from_addr = user_addresses[u]
            coin_msg = {
                "@type": "/cosmos.bank.v1beta1.MsgSend",
                "from_address": from_addr,
                "to_address": from_addr,
                "amount": [{"denom": "udys", "amount": "1000000"}],
            }
            for tag_name in ACTIVE_TAGS:
                log_info(f"[{u}] Tagging post {new_id} with '{tag_name}' (up)")
                try:
                    rate_res = tx_script_exec(
                        from_name=u,
                        script_address=SCRIPT_ADDRESS,
                        function_name=FN_RATE,
                        kwargs_dict={"tag_name": tag_name, "post_id": int(new_id), "rate": "up"},
                        attached_messages=[coin_msg],
                    )
                    if rate_res.get("ok"):
                        ratings_made += 1
                    else:
                        log_warn(f"[{u}] rate_tag failed for post {new_id}, tag '{tag_name}'")
                except Exception as e:
                    log_warn(f"[{u}] rate_tag error for post {new_id}, tag '{tag_name}': {e}")

            # After posting: rate each reply to the parent post randomly up/down
            if parent_post_id is not None:
                replies = storage_list_hot_replies(SCRIPT_ADDRESS, parent_post_id, 10)
                if replies:
                    log_info(f"[{u}] Rating replies for parent post {parent_post_id}: {len(replies)} found")
                for rid in replies:
                    action = rng.choice(["up", "down"])
                    try:
                        res_reply_rate = tx_script_exec(
                            from_name=u,
                            script_address=SCRIPT_ADDRESS,
                            function_name="rate_reply",
                            kwargs_dict={"post_id": int(parent_post_id), "reply_post_id": int(rid), "rate": action},
                            attached_messages=[coin_msg],
                        )
                        if res_reply_rate.get("ok"):
                            ratings_made += 1
                            log_info(f"[{u}] Rated reply {rid} on post {parent_post_id}: {action} (ok)")
                        else:
                            log_warn(f"[{u}] rate_reply failed for post {parent_post_id}, reply '{rid}'")
                    except Exception as e:
                        log_warn(f"[{u}] rate_reply error for post {parent_post_id}, reply '{rid}': {e}")

    # Refresh posts to capture IDs for replies/ratings
    posts = storage_list_posts(SCRIPT_ADDRESS)
    log_info(f"Refreshed posts; now tracking {len(posts)} posts for replies/ratings")

    # Reply logic is now combined into post creation

    # For each active topic, pick a random post from its top-10 hot list and rate up/down
    for u in users:
        from_addr = user_addresses[u]
        coin_msg = {
            "@type": "/cosmos.bank.v1beta1.MsgSend",
            "from_address": from_addr,
            "to_address": from_addr,
            "amount": [{"denom": "udys", "amount": "1000000"}],
        }
        for tag_name in ACTIVE_TAGS:
            q = query_script_run(reader_exec_addr, SCRIPT_ADDRESS, "debug_hot_list", [tag_name, True, 0, 10])
            if not q.get("ok"):
                log_warn(f"[{u}] Failed to fetch hot list for tag '{tag_name}': {q}")
                continue
            info = q.get("result") or {}
            hot_posts = info.get("hot_posts") or []
            if not hot_posts:
                log_info(f"[{u}] No hot posts for tag '{tag_name}'")
                continue
            choice = rng.choice(hot_posts)
            post_id = choice.get("id")
            if post_id is None:
                continue
            action = rng.choice(["up", "down"])  # match script.py signature
            log_info(f"[{u}] Rating hot post {post_id} for tag '{tag_name}': {action}")
            try:
                res_rate = tx_script_exec(
                    from_name=u,
                    script_address=SCRIPT_ADDRESS,
                    function_name=FN_RATE,
                    kwargs_dict={"tag_name": tag_name, "post_id": int(post_id), "rate": action},
                    attached_messages=[coin_msg],
                )
                if res_rate.get("ok"):
                    ratings_made += 1
                    log_info(f"[{u}] Rated tag '{tag_name}' on post {post_id}: {action} (ok)")
                else:
                    log_warn(f"[{u}] rate_tag failed for post {post_id}, tag '{tag_name}'")
            except Exception as e:
                log_warn(f"[{u}] rate_tag error for post {post_id}, tag '{tag_name}': {e}")

    # Claim rewards over threshold for the current user
    for u in users:
        from_addr = user_addresses[u]
        log_info(f"[{u}] Scanning for claimable rewards > {THRESHOLD_UDYS} udys")
        c_tags, c_replies = claim_available_rewards(
            from_name=u,
            from_address=from_addr,
            reader_exec_addr=reader_exec_addr,
            script_address=SCRIPT_ADDRESS,
            threshold_udys=THRESHOLD_UDYS,
        )
        claimed_summary[u]["tags"] += c_tags
        claimed_summary[u]["replies"] += c_replies
        if c_tags or c_replies:
            log_info(f"[{u}] Claimed rewards: tags={c_tags}, replies={c_replies}")

    # Final summary (human-readable)
    total_created = sum(len(v) for v in created_posts.values())
    per_user = ", ".join([f"{u}: {len(v)}" for u, v in created_posts.items()])
    log_info(
        f"Done. Created posts: {total_created} ({per_user}); "
        f"replies made: {replies_made}; ratings made: {ratings_made}"
    )
    for u, ids in created_ids.items():
        if ids:
            log_info(f"[{u}] New post IDs: {', '.join(str(i) for i in ids)}")
    for u, sums in claimed_summary.items():
        log_info(f"[{u}] Rewards claimed -> tags: {sums['tags']}, replies: {sums['replies']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())


