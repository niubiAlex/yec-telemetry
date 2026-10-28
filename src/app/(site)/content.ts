// Copy for the public homepage (yec.askheadline.com/). Recruitment text is the
// owner's 社群招募 copy, with 「Y 输入法」 replaced by the product name.

/** Shown wherever the recruitment copy says to message us. Still the owner's placeholder: replace it. */
export const CONTACT = "[联系人 / 联系方式]";
export const CONTACT_IS_PLACEHOLDER = CONTACT.startsWith("[");

export const PRODUCT = "有道 AI 输入法";
export const SLOGAN = "像老外一样打字";
export const GIFT = "参与内测赠送有道词典 SVIP";
export const TRIAL = "线上体验约 7 天，按平时需要用就好，不用每天打卡。哪里不顺手，也欢迎在微信群里直接说。";

export const AUDIENCES = [
  {
    id: "general",
    tag: "日常 / 通用",
    title: "打中文，也能聊英文",
    body: "回海外客户、聊跨境合作、给导师写邮件……内容想好了，英文怎么说还要再琢磨一遍？输入中文时，就能查看对应的英文表达，选一种适合自己的说法。",
    examples: ["回海外客户消息", "跨境合作沟通", "给导师写邮件"],
    ask: "说下电脑系统和常用场景",
  },
  {
    id: "trade",
    tag: "外贸 / 海外运营",
    title: "报价怎么说，催稿会不会太硬？",
    body: "做外贸、跨境和海外运营的朋友看这里。中文输入时就能查看英文表达，可以拿平时的客户回复、合作邀约、KOL 沟通来体验，看看用在工作里顺不顺手。",
    examples: ["客户回复与报价", "合作邀约", "KOL 沟通"],
    ask: "说下电脑系统和主要用途",
  },
  {
    id: "study",
    tag: "留学 / 学术",
    title: "给导师写邮件，正文写完了，措辞还在改？",
    body: "约讨论时间、跟合作者聊研究、回复修改意见……输入中文时，就能查看对应的英文表达，看看哪种说法更适合这封邮件。",
    examples: ["约导师讨论时间", "和合作者聊研究", "回复修改意见"],
    ask: "说下电脑系统和常用场景",
  },
] as const;

export const TONES = [
  { id: "chat", label: "闲聊", text: "Let's push it to next week." },
  { id: "work", label: "工作", text: "Could we move this to next week?" },
  { id: "academic", label: "学术", text: "We propose postponing this to the following week." },
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
