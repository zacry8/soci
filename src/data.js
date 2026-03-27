export const STATUSES = ["idea", "in-progress", "in-review", "ready"];

export const CHECKLIST_LABELS = {
  copy: "Copy Written",
  media: "Media Ready",
  tags: "Tags Added",
  schedule: "Scheduled",
  approval: "Approved"
};

export const STATUS_LABELS = {
  "idea": "Idea",
  "in-progress": "In Progress",
  "in-review": "In Review",
  "ready": "Ready"
};

export const PLATFORM_OPTIONS = ["Instagram", "TikTok", "LinkedIn", "X"];
export const PROFILE_MODES = ["instagram", "tiktok"];
export const POST_TYPE_OPTIONS = [
  { value: "photo", label: "Photo" },
  { value: "video", label: "Video" },
  { value: "shorts", label: "Shorts" },
  { value: "carousel", label: "Carousel" },
  { value: "text", label: "Text / Blog" }
];

export function makeSeedClients() {
  return [
    createClient("Acme Coffee"),
    createClient("Wave Studio")
  ];
}

function createClient(name) {
  return {
    id: crypto.randomUUID(),
    name,
    channels: ["Instagram"],
    shareSlug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
    sharingEnabled: true
  };
}

export function createEmptyClient(name = "New Client") {
  return createClient(name);
}

export const PLATFORM_PREVIEW_CONFIG = {
  Instagram: { ratio: "4 / 5", maxChars: 180, tone: "Visual-first", className: "platform-ig" },
  TikTok: { ratio: "9 / 16", maxChars: 100, tone: "Hook-first", className: "platform-tt" },
  LinkedIn: { ratio: "1.91 / 1", maxChars: 260, tone: "Professional", className: "platform-li" },
  X: { ratio: "16 / 9", maxChars: 120, tone: "Concise", className: "platform-x" }
};

const now = new Date().toISOString();
const day = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * day).toISOString();
const daysFromNow = (n) => new Date(Date.now() + n * day).toISOString();

export function makeSeedPosts(clients = makeSeedClients()) {
  const [clientA, clientB] = clients;

  return [
    {
      id: crypto.randomUUID(),
      clientId: clientA.id,
      visibility: "client-shareable",
      title: "Vintage Surf Branding Showcase",
      status: "in-progress",
      publishState: "published",
      publishedAt: daysAgo(5),
      scheduledAt: "",
      scheduleDate: new Date(new Date().getFullYear(), new Date().getMonth(), 15).toISOString().slice(0, 10),
      platforms: ["Instagram", "TikTok"],
      postType: "shorts",
      platformVariants: { Instagram: "IG cut", TikTok: "Short hook version" },
      tags: ["design", "portfolio"],
      caption: "Riding the wave of nostalgia with our latest branding project.",
      mediaIds: [],
      assignee: "Content Lead",
      reviewer: "Mia",
      comments: [{ author: "Mia", text: "Need CTA in last sentence.", at: now }],
      checklist: { copy: true, media: true, tags: true, schedule: true, approval: false },
      createdAt: now,
      updatedAt: now
    },
    {
      id: crypto.randomUUID(),
      clientId: clientB.id,
      visibility: "client-shareable",
      title: "Agency Q1 Reel Launch",
      status: "ready",
      publishState: "scheduled",
      publishedAt: "",
      scheduledAt: daysFromNow(3),
      scheduleDate: new Date(new Date().getFullYear(), new Date().getMonth(), 20).toISOString().slice(0, 10),
      platforms: ["LinkedIn", "Instagram"],
      postType: "shorts",
      platformVariants: { LinkedIn: "Business tone", Instagram: "Visual-first caption" },
      tags: ["agency", "video"],
      caption: "Everything we touched in Q1. Sound on.",
      mediaIds: [],
      assignee: "Jules",
      reviewer: "Account Lead",
      comments: [],
      checklist: { copy: true, media: true, tags: true, schedule: true, approval: true },
      createdAt: now,
      updatedAt: now
    },
    {
      id: crypto.randomUUID(),
      clientId: clientA.id,
      visibility: "internal",
      title: "Coffee Client Setup Shot",
      status: "idea",
      publishState: "draft",
      publishedAt: "",
      scheduledAt: "",
      scheduleDate: "",
      platforms: ["Instagram"],
      postType: "photo",
      platformVariants: { Instagram: "BTS lifestyle angle" },
      tags: ["bts", "photo"],
      caption: "Behind the scenes at the morning shoot.",
      mediaIds: [],
      assignee: "",
      reviewer: "",
      comments: [],
      checklist: { copy: false, media: false, tags: false, schedule: false, approval: false },
      createdAt: now,
      updatedAt: now
    }
  ];
}

export function createEmptyPost(clientId = "") {
  const stamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    clientId,
    visibility: "client-shareable",
    title: "Untitled Post",
    status: "idea",
    publishState: "draft",
    publishedAt: "",
    scheduledAt: "",
    scheduleDate: "",
    platforms: ["Instagram"],
    postType: "photo",
    platformVariants: { Instagram: "" },
    tags: [],
    caption: "",
    mediaIds: [],
    assignee: "",
    reviewer: "",
    comments: [],
    checklist: { copy: false, media: false, tags: false, schedule: false, approval: false },
    createdAt: stamp,
    updatedAt: stamp
  };
}