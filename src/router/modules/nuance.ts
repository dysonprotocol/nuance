import PostDetail from "@/views/nuance/PostDetail.vue";
import Topics from "@/views/nuance/Topics.vue";
import NuancePublish from "@/views/nuance/NuancePublish.vue";
import TagPostsView from "@/views/nuance/TagPostsView.vue";
import TopicStats from "@/views/nuance/TopicStats.vue";
import type { RouteRecordRaw } from "vue-router";
import CustomAuthorView from "@/views/nuance/CustomAuthorView.vue";
import RecentPostsView from "@/views/nuance/RecentPostsView.vue";
import ActivePostsView from "@/views/nuance/ActivePostsView.vue";

export const nuanceGlobalRoutes: RouteRecordRaw[] = [
  { path: "/topics", name: "NuanceTopics", component: Topics },
  { path: "/recent", name: "NuanceRecent", component: RecentPostsView },
  { path: "/active", name: "NuanceActive", component: ActivePostsView },
  {
    path: "/topics/:tag/hot",
    name: "NuanceTopicHot",
    component: TagPostsView,
    props: true,
  },
  {
    path: "/topics/:tag/best",
    name: "NuanceTopicBest",
    component: TagPostsView,
    props: true,
  },
  {
    path: "/topics/:tag",
    redirect: (to) => ({ name: "NuanceTopicHot", params: to.params }),
  },
  {
    path: "/topics/:tag/stats",
    name: "NuanceTopicStats",
    component: TopicStats,
    props: true,
  },
  {
    path: "/authors/:author",
    name: "NuanceAuthorPosts",
    component: CustomAuthorView,
    props: true,
  },
  {
    path: "/:postId(\\d+)",
    name: "NuancePostDetail",
    component: PostDetail,
    props: true,
  },
  { path: "/publish", name: "NuancePublish", component: NuancePublish },
];

export const authorWhitelabelRoutes: RouteRecordRaw[] = [
  { path: "/", name: "AuthorHome", component: CustomAuthorView },
];
