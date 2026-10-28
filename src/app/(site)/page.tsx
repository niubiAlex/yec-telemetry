import type { ReactNode } from "react";
import { macDownload, megabytes, renamed, windowsDownload, type Download } from "@/lib/site";
import { AUDIENCES, CONTACT, CONTACT_IS_PLACEHOLDER, FAQ, GIFT, PRODUCT, SLOGAN, TRIAL, VIDEOS } from "./content";
import { TryBox, TryButton } from "./TryBox";

export const runtime = "nodejs";
export const revalidate = 300;

const NAV = [
  ["#features", "功能"],
  ["#videos", "视频"],
  ["#who", "适合谁"],
  ["#join", "加入内测"],
  ["#privacy", "隐私"],
  ["#faq", "常见问题"],
] as const;

function Contact() {
  return <span className={CONTACT_IS_PLACEHOLDER ? "contact placeholder" : "contact"}>{CONTACT}</span>;
}

function Shot({ src, alt, caption, w, h }: { src: string; alt: string; caption?: string; w: number; h: number }) {
  return (
    <figure className="shot">
      <img src={src} alt={alt} width={w} height={h} loading="lazy" decoding="async" />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

function Feature({ id, icon, title, children, shot, flip }: { id?: string; icon: string; title: string; children: ReactNode; shot: ReactNode; flip?: boolean }) {
  return (
    <article id={id} className={flip ? "feat flip" : "feat"}>
      <div>
        <span className="ficon" aria-hidden="true">{icon}</span>
        <h3 style={{ fontSize: 26 }}>{title}</h3>
        {children}
      </div>
      {shot}
    </article>
  );
}

function DownloadButton({ d, label }: { d: Download | null; label: string }) {
  if (!d) {
    return (
      <a className="dl off" href="#join">
        {label}
        <small>暂时取不到安装包，请联系我们获取</small>
      </a>
    );
  }
  return (
    <a className="dl" href={d.href} download={d.filename}>
      {label}
      <small>{["版本 " + d.version, megabytes(d.size)].filter(Boolean).join(" · ")}</small>
    </a>
  );
}

export default async function Home() {
  const [mac, win] = await Promise.all([macDownload(), windowsDownload()]);
  return (
    <>
      <header className="top">
        <div className="topin">
          <a className="brand" href="/">
            <span className="logo" aria-hidden="true">有</span>
            {PRODUCT}
            <span className="beta">内测</span>
          </a>
          <nav className="links" aria-label="页面导航">
            {NAV.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <div className="topend">
            <a className="btn btn-primary btn-sm" href="#download">下载</a>
            <details className="menu">
              <summary aria-label="菜单">☰</summary>
              <nav aria-label="页面导航">
                {NAV.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
                <a href="#download">下载</a>
              </nav>
            </details>
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="wrap herogrid">
            <div>
              <span className="eyebrow">{SLOGAN} · 内测招募中</span>
              <h1>打中文，<span className="accent">也能聊英文</span></h1>
              <p className="lead">
                回海外客户、聊跨境合作、给导师写邮件……内容想好了，英文怎么说还要再琢磨一遍？用{PRODUCT}，输入中文时就能看到对应的英文表达，选一种适合自己的说法。
              </p>
              <ul className="points">
                <li>打中文直接出英文</li>
                <li>闲聊 / 工作 / 学术三种说法</li>
                <li>英文一键改地道</li>
                <li>边打字边学</li>
              </ul>
              <div className="btns">
                <a className="btn btn-primary" href="#join">申请内测</a>
                <a className="btn btn-secondary" href="#download">下载 Mac / Windows 版</a>
              </div>
              <div className="gift">
                <span className="gifticon" aria-hidden="true">礼</span>
                <div>
                  <b>{GIFT}</b>
                  <p>{TRIAL}</p>
                </div>
              </div>
            </div>
            <TryBox />
          </div>
        </section>

        <section className="band" id="features">
          <div className="wrap">
            <h2 className="center">{SLOGAN}，从打中文开始</h2>
            <p className="sub center">还是你熟悉的拼音输入法。停一下，英文就在候选条下方等你；不需要就继续打字。</p>
            <div className="feats">
              <Feature
                icon="中→英"
                title="中译英卡片：打完中文，英文已经好了"
                shot={<Shot src="/home/card.webp" alt="新手引导里的翻译卡片：打「我们改到下周吧」，卡片给出 Let's push it to next week." w={1200} h={758} caption="Mac 真实截图" />}
              >
                <p>在微信、邮件、文档里照常打中文。停顿一下，候选条下方出现整句英文草稿，满意就换上去，不满意继续打字。</p>
                <ul className="keys">
                  <li><kbd>Ctrl J</kbd> 把刚打的这句换成英文</li>
                  <li><kbd>点卡片</kbd> 同样换成英文；点英文里的单词是查词</li>
                  <li><kbd>Esc</kbd> 关掉卡片，中文原样保留</li>
                </ul>
              </Feature>
              <Feature
                flip
                icon="Ctrl T"
                title="三种语气：同一句话，看场合说"
                shot={<Shot src="/home/tones.webp" alt="同一句话的三种写法：闲聊、工作、学术" w={1200} h={758} caption="Mac 真实截图" />}
              >
                <p>跟朋友闲聊、给客户回消息、给导师写邮件，说法不一样。卡片上按 <kbd>Ctrl T</kbd> 切换，或直接点「闲聊 / 工作 / 学术」。默认用哪种，可以在设置里选。</p>
                <ul>
                  <li>闲聊：<span className="en">Let&apos;s push it to next week.</span></li>
                  <li>工作：<span className="en">Could we move this to next week?</span></li>
                  <li>学术：<span className="en">We propose postponing this to the following week.</span></li>
                </ul>
              </Feature>
              <Feature
                icon="Aa"
                title="英文润色：自己写的英文，一键改地道"
                shot={<Shot src="/home/polish.webp" alt="英文润色卡片 More natural 给出改好的整句" w={1200} h={353} caption="Windows 真实录屏截图（外贸版宣传片）" />}
              >
                <p>单按 <kbd>Shift</kbd> 切到英文，直接打英文。停一下，「More natural」卡片给出改好的整句，<kbd>Ctrl J</kbd> 一键换上。</p>
                <p className="en note">if you order more than 2000 pcs, we can give you 5% discount<br />→ If you order more than 2000 pcs, we can offer you a 5% discount.</p>
              </Feature>
              <Feature
                id="learn"
                flip
                icon="学"
                title="边打字边学：新词、句子自动收进来"
                shot={
                  <div className="shots2">
                    <Shot src="/home/words.webp" alt="学习仪表盘的今日新词，带例句，可以一键加入词库" w={1200} h={736} caption="今日新词" />
                    <Shot src="/home/review.webp" alt="句子回顾：认真看过的句子" w={1200} h={805} caption="句子回顾" />
                  </div>
                }
              >
                <p>不用另外背单词，学习就藏在每天的打字里。</p>
                <ul>
                  <li><b>边打字边认词：</b>打字时先看到每个词的英文；整句出来后，查过的词和值得学的新词会标出来，点词看小词典。</li>
                  <li><b>今日新词：</b>卡片上标出的新词自动列进学习仪表盘，带例句；一键加入词库，打字时提醒你用上。</li>
                  <li><b>句子回顾：</b>卡片停留 4 秒以上的句子自动记下，随时回顾。只存在你的电脑上。</li>
                </ul>
              </Feature>
              <Feature
                icon="拼"
                title="个性化拼音纠错：越用越懂你的手误"
                shot={<Shot src="/home/pinyin.webp" alt="设置里的拼音纠错列表：kryi 改成 keyi 可以" w={1072} h={596} caption="Mac 真实截图" />}
              >
                <p>记住你常打错的拼音。同一个错改过 2 次后，再打错时，改好的词排在第二个，按 2 就能选。</p>
                <p>纠错记录只存在你的电脑上，不上传，也不会发给模型；在设置里随时查看、删除或关掉。</p>
              </Feature>
              <Feature
                flip
                icon="⌘ ⊞"
                title="Mac 和 Windows 都能用"
                shot={<Shot src="/home/windows.webp" alt="Windows 版新手引导的设置页：默认场景、英语水平" w={1198} h={462} caption="Windows 真实截图" />}
              >
                <p>两边功能和快捷键一致，换电脑也不用重新适应。装好后有新手引导，一步步带你试一遍。</p>
                <div className="platforms">
                  <div className="platform"><b>Mac</b><span>macOS 26 及以上 · Apple 芯片</span></div>
                  <div className="platform"><b>Windows</b><span>Windows 10 / 11 · 64 位</span></div>
                </div>
              </Feature>
            </div>
          </div>
        </section>

        <section className="band soft" id="videos">
          <div className="wrap">
            <h2 className="center">看看真实用起来的样子</h2>
            <p className="sub center">两段短片，画面里的输入法操作都是真实录屏。点播放才会加载，默认不自动播放。</p>
            <div className="videos">
              {VIDEOS.map((v) => (
                <article className="vcard" id={`video-${v.id}`} key={v.id}>
                  <video className="v-wide" controls preload="none" playsInline poster={`/home/poster-${v.id}.webp`}
                    src={`/dl/site/promo-${v.id}-16x9.mp4`} aria-label={`${v.title}宣传片`} />
                  <video className="v-tall" controls preload="none" playsInline poster={`/home/poster-${v.id}-v.webp`}
                    src={`/dl/site/promo-${v.id}-9x16.mp4`} aria-label={`${v.title}宣传片（竖版）`} />
                  <div className="vbody">
                    <h3>{v.title} <small>{v.seconds} 秒</small></h3>
                    <p>{v.blurb}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="band" id="who">
          <div className="wrap">
            <h2 className="center">谁适合来试试</h2>
            <p className="sub center">平时用中文想、要用英文发出去的人，或者想在日常里把英语用起来的人。下面三类朋友，我们尤其想听听你的感受。</p>
            <div className="auds">
              {AUDIENCES.map((a) => (
                <article className="aud" key={a.id}>
                  <div className="tag">{a.tag}</div>
                  <h3>{a.title}</h3>
                  <p>{a.body}</p>
                  <div className="chips">{a.chips.map((e) => <span className="chip" key={e}>{e}</span>)}</div>
                  <div className="audacts">
                    <TryButton text={a.tryText} />
                    <a className="audlink" href={a.link.href}>{a.link.label} →</a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="band soft" id="join">
          <div className="wrap">
            <h2 className="center">加入内测</h2>
            <p className="sub center">{GIFT}。{TRIAL}</p>
            <ol className="steps">
              <li>
                <span className="num">1</span>
                <h3>私信报名</h3>
                <p>欢迎私信 <Contact />，说下电脑系统和常用场景（或主要用途）。</p>
              </li>
              <li>
                <span className="num">2</span>
                <h3>确认适配，安装</h3>
                <p>确认适配后发安装包，也可以直接在下方下载最新版。装好后跟着新手引导试一遍。</p>
              </li>
              <li>
                <span className="num">3</span>
                <h3>用 7 天，随时反馈</h3>
                <p>按平时需要用就好，不用每天打卡。哪里翻得不合适、语气拿捏不准，在微信群里直接说。</p>
              </li>
            </ol>
            <p className="note center" style={{ marginTop: 24 }}>也欢迎转给身边有需要的朋友，谢谢大家帮忙！</p>
          </div>
        </section>

        <section className="band dark download" id="download">
          <div className="wrap">
            <span className="eyebrow">内测版</span>
            <h2>下载{PRODUCT}</h2>
            <p className="sub">安装后在系统的输入法列表里选「有道 AI 输入法」{renamed(mac, win) ? "" : "（当前版本在列表里暂时显示为「有道输入」）"}，跟着新手引导走一遍就好。之后有新版本，输入法里会提示更新。</p>
            <div className="dls">
              <DownloadButton d={mac} label="下载 Mac 版" />
              <DownloadButton d={win} label="下载 Windows 版" />
            </div>
            <div className="reqs">
              <p>Mac：macOS 26 及以上，Apple 芯片（M 系列）。Windows：Windows 10 / 11，64 位。</p>
              <p>报名内测请先私信 <Contact />，方便拉你进微信群、发放有道词典 SVIP。</p>
            </div>
          </div>
        </section>

        <section className="band soft" id="privacy">
          <div className="wrap">
            <h2 className="center">隐私：说清楚收什么、不收什么</h2>
            <p className="sub center">内测是为了把产品改好。下面是内测版会上传的全部内容，每一项都能在「设置 → 隐私」里关掉。</p>
            <div className="privgrid">
              <div className="priv">
                <span className="state local">只在本机</span>
                <h3>打字本身</h3>
                <p>拼音输入在你的电脑上完成。拼音纠错记录和句子回顾只存在本机，不上传。</p>
              </div>
              <div className="priv">
                <span className="state">需要联网</span>
                <h3>英文卡片和润色</h3>
                <p>生成英文卡片和润色建议时，当前这一句会发送给有道的 AI 模型服务，用来生成结果。</p>
              </div>
              <div className="priv">
                <span className="state on">默认开启，可关闭</span>
                <h3>匿名使用统计</h3>
                <p>只统计功能用了几次，以及在哪些应用里用了输入法（应用名称和类别）。不含你打的字、窗口标题或网址。</p>
              </div>
              <div className="priv">
                <span className="state on">默认开启，可关闭</span>
                <h3>帮助改进翻译和润色</h3>
                <p>只有你对某张卡片点了赞或踩（或填写问卷原因），才上传那一条的原句和结果，供团队人工检查准确度。平时打的其他内容不上传。</p>
              </div>
              <div className="priv">
                <span className="state">默认关闭，需你同意</span>
                <h3>上传打字内容</h3>
                <p>只有你在提示里点「同意」后，才上传上屏的文字和卡片的原句、结果，帮助改进产品。之前打的字不补传。</p>
              </div>
            </div>
            <div className="rules">
              <h3>上传的内容都遵守这些规则</h3>
              <ul>
                <li>密码框里的输入，以及含 6 位以上连续数字、邮箱或网址的内容，一律不上传。</li>
                <li>永远不收集窗口标题、网址、联系人、聊天对象和剪贴板内容。</li>
                <li>只有{PRODUCT}团队里负责检查效果的少数成员能看到；不给第三方，不用于广告，也不用来训练模型。</li>
                <li>每条最多保存 90 天，Beta 结束后全部删除。在「设置 → 隐私」里可以随时关掉，并删除已上传的内容。</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="band" id="faq">
          <div className="wrap narrow">
            <h2 className="center">常见问题</h2>
            <div style={{ marginTop: 32 }}>
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="footin">
          <div>
            <a className="brand" href="/"><span className="logo" aria-hidden="true">有</span>{PRODUCT}</a>
            <p style={{ maxWidth: 480 }}>{SLOGAN}。打中文，也能聊英文。内测版，欢迎反馈。</p>
          </div>
          <nav aria-label="页脚导航">
            <h2>页面</h2>
            {NAV.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
            <a href="#download">下载</a>
          </nav>
        </div>
        <div className="footlegal">{PRODUCT}（内测版）</div>
      </footer>
    </>
  );
}
