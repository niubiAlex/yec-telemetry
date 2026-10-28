// Copy for the public homepage (yec.askheadline.com/). Recruitment text is the
// owner's 社群招募 copy, with the product named 有道 AI 输入法 throughout.

/** Shown wherever the recruitment copy says to message us. Still the owner's placeholder: replace it. */
export const CONTACT = "[联系人 / 联系方式]";
export const CONTACT_IS_PLACEHOLDER = CONTACT.startsWith("[");

export const PRODUCT = "有道 AI 输入法";
export const SLOGAN = "像老外一样打字";
export const GIFT = "参与内测赠送有道词典 SVIP";
export const TRIAL = "线上体验约 7 天，按平时需要用就好，不用每天打卡。哪里不顺手，也欢迎在微信群里直接说。";

/** Free model translations per browser per day in the try-it box (TRY_PER_VISITOR_DAILY on the server). */
export const PER_DAY = 20;
export const TRY_EVENT = "yec-try";

export const TONE_LABEL = { chat: "闲聊", work: "工作", academic: "学术" } as const;

export const AUDIENCES = [
  {
    id: "trade",
    tag: "外贸 / 跨境 / 海外运营",
    title: "报价怎么说，催稿会不会太硬？",
    body: "客户发来询价，你用中文想好怎么回：价格、交期、起订量。打完停一下，「工作」语气的英文已经写好；给海外达人发合作邀约，换成「闲聊」语气，读起来更像朋友之间说话。",
    chips: ["客户回复", "报价与议价", "KOL 合作邀约"],
    tryText: "这个报价能不能再便宜一点？",
    link: { href: "#video-work", label: "看外贸版短片（31 秒）" },
  },
  {
    id: "study",
    tag: "留学 / 学术交流",
    title: "给导师写邮件，正文写完了，措辞还在改？",
    body: "约导师讨论论文、回复修改意见、在小组作业群里分工。给导师用「学术」或「工作」语气，回同学用「闲聊」，同一句话不用自己改三遍。",
    chips: ["给导师写邮件", "小组作业分工", "回复修改意见"],
    tryText: "老师您好，想约您下周二下午讨论一下论文",
    link: { href: "#video-study", label: "看留学版短片（42 秒）" },
  },
  {
    id: "learn",
    tag: "想把英语用起来的人",
    title: "不用另外背单词，每天打字就在学",
    body: "卡片上标出值得学的新词，自动收进「今日新词」；一键「加入词库」，以后打到相近的中文，会提醒你用上；认真看过的句子留在「句子回顾」里。泡在每天的打字里，说法慢慢就地道了。",
    chips: ["今日新词", "加入词库", "句子回顾"],
    tryText: "这个 deadline 能不能往后推两天",
    link: { href: "#learn", label: "看边打字边学怎么用" },
  },
] as const;

export const VIDEOS = [
  {
    id: "study",
    title: "留学版",
    blurb: "给教授写邮件、和国际同学群聊、英文润色、边用边学。",
    seconds: 42,
  },
  {
    id: "work",
    title: "外贸版",
    blurb: "客户英文询价，中文直接出英文；报价英文一键改地道。",
    seconds: 31,
  },
] as const;

export const FAQ: { q: string; a: string }[] = [
  { q: "参加内测要花钱吗？", a: "不用。参与本轮内测还赠送有道词典 SVIP，领取方式以内测微信群里的通知为准。" },
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
