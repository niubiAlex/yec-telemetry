// Copy for the public homepage (yec.askheadline.com/). Recruitment text is the
// owner's 社群招募 copy, with the product named 有道 AI 输入法 throughout.

/**
 * The WeChat Work group QR, the only way to join. Group QRs expire after 7 days:
 * to swap it, run `python3 scripts/wechat-qr.py <new export.png>` (rewrites
 * public/home/wechat-qr.png), then commit and push.
 */
export const WECHAT_QR = "/home/wechat-qr.png";
export const WECHAT_GROUP = "【输入法】内测群-2026.10";
export const JOIN_CTA = "扫码进群，领取内测专属福利";

export const PRODUCT = "有道 AI 输入法";
export const SLOGAN = "像老外一样打字";
export const SLOGAN_EN = "Type like a native.";
export const SLOGAN_LEARN = "一种神奇的学习方式";
export const SLOGAN_LEARN_EN = "A magical way to learn.";
export const GIFT = "参与内测，进群领取内测专属福利";
export const TRIAL = "线上体验约 7 天，按平时需要用就好，不用每天打卡。哪里不顺手，也欢迎在微信群里直接说。";

/** Free model translations per browser per day in the try-it box (TRY_PER_VISITOR_DAILY on the server). */
export const PER_DAY = 20;
export const TRY_EVENT = "yec-try";

export const TONE_LABEL = { chat: "闲聊", work: "工作", academic: "学术" } as const;

export const AUDIENCES = [
  {
    id: "trade",
    pillar: "native",
    tag: "外贸 / 跨境 / 海外运营",
    title: "报价怎么说，催稿会不会太硬？",
    body: "客户发来询价，你用中文想好怎么回：价格、交期、起订量。打完停一下，「工作」语气的英文已经写好；给海外达人发合作邀约，换成「闲聊」语气，读起来更像朋友之间说话。",
    chips: ["客户回复", "报价与议价", "KOL 合作邀约"],
    tryText: "这个报价能不能再便宜一点？",
    link: { href: "#video-work", label: "看外贸版短片（31 秒）" },
  },
  {
    id: "study",
    pillar: "native",
    tag: "留学 / 学术交流",
    title: "给导师写邮件，正文写完了，措辞还在改？",
    body: "约导师讨论论文、回复修改意见、在小组作业群里分工。给导师用「学术」或「工作」语气，回同学用「闲聊」，同一句话不用自己改三遍。",
    chips: ["给导师写邮件", "小组作业分工", "回复修改意见"],
    tryText: "老师您好，想约您下周二下午讨论一下论文",
    link: { href: "#video-study", label: "看留学版短片（42 秒）" },
  },
  {
    id: "learn",
    pillar: "learn",
    tag: "想把英语用起来的普通学习者",
    title: "照常打中文、发中文，英语顺手就学了",
    body: "平时聊天、写周报都用中文，不想另外背单词。打字时看一眼英文卡片，新词和地道说法就记住了；觉得有用就「加入词库」，下次打到相近的中文，它会再出现在卡片上。用着用着，就复习了。",
    chips: ["今日新词", "加入词库", "下次打字再遇见"],
    tryText: "这个 deadline 能不能往后推两天",
    link: { href: "#video-learner", label: "看学习版短片（42 秒）" },
  },
] as const;

/** 16:9 only, from Blob under /dl/site/. A new cut gets a new file name, so no cache serves the old one. */
export const VIDEOS = [
  {
    id: "work",
    pillar: "native",
    file: "promo-work-16x9.mp4",
    title: "外贸版",
    blurb: "客户英文询价，中文直接出英文；报价英文一键改地道。",
    seconds: 31,
  },
  {
    id: "study",
    pillar: "native",
    file: "promo-study-16x9.mp4",
    title: "留学版",
    blurb: "给教授写邮件、和国际同学群聊、英文润色。",
    seconds: 42,
  },
  {
    id: "learner",
    pillar: "learn",
    file: "promo-learner-magical-16x9.mp4",
    title: "学习版",
    blurb: "每天照常打中文，看一眼卡片就学到新词；加入词库的词，下次打字时再出现。",
    seconds: 42,
  },
] as const;

export const FAQ: { q: string; a: string }[] = [
  { q: "参加内测要花钱吗？", a: "不用。参与本轮内测还有内测专属福利，扫码进群后领取，具体以群里的通知为准。" },
  { q: "怎么加入内测？", a: `用微信或企业微信扫描本页的二维码，加入「${WECHAT_GROUP}」。也可以直接在本页下载安装，再进群反馈。` },
  {
    q: "怎么边打字边学？",
    a: "照常打中文就好。英文卡片会标出值得学的新词，自动收进「今日新词」；点「加入词库」后，下次打到相近的中文，这个词会再出现在卡片上，用着用着就复习了。认真看过的句子留在「句子回顾」里。",
  },
  {
    q: "支持哪些电脑？",
    a: "Mac：macOS 26 及以上、Apple 芯片（M 系列）。Windows：Windows 10 / 11 64 位。两边的功能和快捷键一致。",
  },
  { q: "需要联网吗？", a: "打中文不需要联网，在你的电脑上完成。英文卡片和英文润色要用 AI 模型生成，需要联网。" },
  {
    q: "会不会打扰我正常打字？",
    a: "卡片只在你停顿时出现在候选条下方，不抢焦点。不需要就继续打字，或按 Esc 关掉，中文原样保留。",
  },
  { q: "Ctrl J、Ctrl T 是哪个键？", a: "Ctrl 是键盘上的 control 键，Mac 上也是 control，不是 command。Ctrl J 换上英文，Ctrl T 切换闲聊 / 工作 / 学术三种说法。" },
  { q: "怎么切换中英文？", a: "单按一下 Shift。英文模式下直接打英文，停一下会出现更地道的润色建议。" },
  { q: "内测期间要做什么？", a: "大约 7 天，平时怎么打字就怎么用，不用每天打卡。哪里翻得不合适、语气拿捏不准、哪里不顺手，在微信群里直接告诉我们。" },
  { q: "怎么更新？", a: "有新版本时，输入法里会提示，点「下载并安装」就行。也可以随时回到这个页面下载最新版。" },
  { q: "上传过的内容怎么删除？", a: "在「设置 → 隐私」里，「删除我上传的内容」和「删除我的打字记录」会删掉服务器上这台电脑上传的全部内容。" },
];
