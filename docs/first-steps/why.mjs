/**
 * "Why" intro for the first-steps instructions: before the "how", the user sees the goal —
 * build as large a trust graph as possible: you invite your first handshake circle, they invite theirs, and so on.
 *
 *  - prependWhyVideo(browser, l, mp4) — puts a ~16 s intro in front of the video (the diagram grows ring by ring
 *    while the points appear one by one), then a soft cut into the "how" part;
 *  - addWhyBanner(browser, l, jpg) — puts the same intro as a banner on top of the step-by-step illustration sheet.
 * Used by shoot-video.mjs after every take; `node add-why.mjs` applies it to already recorded files.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const WHY = {
  ru: { title: 'Зачем это?', sub: 'Сеть взаимной помощи из реальных знакомых', points: [
    'Цель — построить как можно больший граф доверия',
    'Вы приглашаете тех, кого знаете лично — это ваш первый круг рукопожатий',
    'Они приглашают своих — и сеть растёт дальше, круг за кругом',
    'Чем больше сеть, тем быстрее приходит помощь, когда она нужна'], next: 'А теперь — как это сделать' },
  en: { title: 'Why?', sub: 'A mutual support network of people who really know each other', points: [
    'The goal is to build the largest possible graph of trust',
    'You invite people you know personally — this is your first handshake circle',
    'They invite their own people — and the network keeps growing, circle by circle',
    'The bigger the network, the faster help comes when it is needed'], next: 'Now — how to do it' },
  uk: { title: 'Навіщо це?', sub: 'Мережа взаємодопомоги з реальних знайомих', points: [
    'Мета — побудувати якомога більший граф довіри',
    'Ви запрошуєте тих, кого знаєте особисто — це ваше перше коло рукостискань',
    'Вони запрошують своїх — і мережа росте далі, коло за колом',
    'Що більша мережа, то швидше приходить допомога, коли вона потрібна'], next: 'А тепер — як це зробити' },
  be: { title: 'Навошта гэта?', sub: 'Сетка ўзаемадапамогі з рэальных знаёмых', points: [
    'Мэта — пабудаваць як мага большы граф даверу',
    'Вы запрашаеце тых, каго ведаеце асабіста — гэта ваша першае кола поціскаў рукі',
    'Яны запрашаюць сваіх — і сетка расце далей, кола за колам',
    'Чым большая сетка, тым хутчэй прыходзіць дапамога, калі яна патрэбна'], next: 'А цяпер — як гэта зрабіць' },
  sr: { title: 'Зашто?', sub: 'Мрежа узајамне помоћи од стварних познаника', points: [
    'Циљ је изградити што већи граф поверења',
    'Позивате оне које лично познајете — то је ваш први круг руковања',
    'Они позивају своје — и мрежа расте даље, круг по круг',
    'Што је мрежа већа, то помоћ брже стиже када је потребна'], next: 'А сада — како то урадити' },
  de: { title: 'Wozu?', sub: 'Ein Netzwerk gegenseitiger Hilfe aus echten Bekannten', points: [
    'Ziel ist ein möglichst großer Graph des Vertrauens',
    'Sie laden Menschen ein, die Sie persönlich kennen — Ihr erster Handschlag-Kreis',
    'Diese laden ihre Leute ein — und das Netzwerk wächst weiter, Kreis um Kreis',
    'Je größer das Netzwerk, desto schneller kommt Hilfe, wenn sie gebraucht wird'], next: 'Und jetzt — wie es geht' },
  fr: { title: 'Pourquoi ?', sub: 'Un réseau d’entraide entre personnes qui se connaissent vraiment', points: [
    'Le but : construire le plus grand graphe de confiance possible',
    'Vous invitez les personnes que vous connaissez — votre premier cercle de poignées de main',
    'Elles invitent les leurs — et le réseau grandit, cercle après cercle',
    'Plus le réseau est grand, plus l’aide arrive vite quand on en a besoin'], next: 'Et maintenant — comment faire' },
  es: { title: '¿Para qué?', sub: 'Una red de ayuda mutua entre personas que se conocen de verdad', points: [
    'El objetivo es construir el mayor grafo de confianza posible',
    'Invitas a quienes conoces en persona — es tu primer círculo de apretones de manos',
    'Ellos invitan a los suyos — y la red sigue creciendo, círculo a círculo',
    'Cuanto más grande es la red, más rápido llega la ayuda cuando hace falta'], next: 'Ahora — cómo hacerlo' },
  pt: { title: 'Para quê?', sub: 'Uma rede de ajuda mútua entre pessoas que se conhecem de verdade', points: [
    'O objetivo é construir o maior grafo de confiança possível',
    'Você convida quem conhece pessoalmente — é o seu primeiro círculo de apertos de mão',
    'Eles convidam os seus — e a rede continua crescendo, círculo a círculo',
    'Quanto maior a rede, mais rápido chega a ajuda quando é preciso'], next: 'Agora — como fazer' },
  it: { title: 'Perché?', sub: 'Una rete di aiuto reciproco tra persone che si conoscono davvero', points: [
    'L’obiettivo è costruire il più grande grafo di fiducia possibile',
    'Inviti chi conosci di persona — è la tua prima cerchia di strette di mano',
    'Loro invitano i loro conoscenti — e la rete cresce, cerchia dopo cerchia',
    'Più la rete è grande, più in fretta arriva l’aiuto quando serve'], next: 'Ora — come si fa' },
  nl: { title: 'Waarom?', sub: 'Een netwerk van wederzijdse hulp tussen mensen die elkaar echt kennen', points: [
    'Het doel: een zo groot mogelijke graaf van vertrouwen bouwen',
    'U nodigt mensen uit die u persoonlijk kent — uw eerste handdrukcirkel',
    'Zij nodigen hun mensen uit — en het netwerk groeit verder, cirkel na cirkel',
    'Hoe groter het netwerk, hoe sneller er hulp komt wanneer die nodig is'], next: 'En nu — hoe het werkt' },
  pl: { title: 'Po co?', sub: 'Sieć wzajemnej pomocy z prawdziwych znajomych', points: [
    'Cel — zbudować jak największy graf zaufania',
    'Zapraszasz osoby, które znasz osobiście — to twój pierwszy krąg uścisków dłoni',
    'Oni zapraszają swoich — i sieć rośnie dalej, krąg po kręgu',
    'Im większa sieć, tym szybciej przychodzi pomoc, gdy jest potrzebna'], next: 'A teraz — jak to zrobić' },
  cs: { title: 'Proč?', sub: 'Síť vzájemné pomoci ze skutečných známých', points: [
    'Cílem je vybudovat co největší graf důvěry',
    'Pozvete ty, které znáte osobně — to je váš první kruh podání ruky',
    'Oni pozvou své — a síť roste dál, kruh za kruhem',
    'Čím větší síť, tím rychleji přijde pomoc, když je potřeba'], next: 'A teď — jak na to' },
  ro: { title: 'De ce?', sub: 'O rețea de ajutor reciproc între oameni care se cunosc cu adevărat', points: [
    'Scopul este să construim cel mai mare graf de încredere posibil',
    'Invitați oamenii pe care îi cunoașteți personal — primul vostru cerc de strângeri de mână',
    'Ei își invită oamenii lor — și rețeaua crește mai departe, cerc după cerc',
    'Cu cât rețeaua e mai mare, cu atât ajutorul vine mai repede când e nevoie'], next: 'Acum — cum se face' },
  da: { title: 'Hvorfor?', sub: 'Et netværk af gensidig hjælp mellem mennesker, der kender hinanden', points: [
    'Målet er at bygge den størst mulige graf af tillid',
    'Du inviterer folk, du kender personligt — det er din første håndtrykscirkel',
    'De inviterer deres folk — og netværket vokser videre, cirkel for cirkel',
    'Jo større netværket er, jo hurtigere kommer hjælpen, når den er nødvendig'], next: 'Og nu — sådan gør du' },
  sv: { title: 'Varför?', sub: 'Ett nätverk av ömsesidig hjälp mellan människor som känner varandra', points: [
    'Målet är att bygga en så stor graf av förtroende som möjligt',
    'Du bjuder in personer du känner personligen — din första handslagscirkel',
    'De bjuder in sina — och nätverket fortsätter växa, cirkel för cirkel',
    'Ju större nätverket är, desto snabbare kommer hjälpen när den behövs'], next: 'Och nu — så här gör du' },
  no: { title: 'Hvorfor?', sub: 'Et nettverk av gjensidig hjelp mellom mennesker som kjenner hverandre', points: [
    'Målet er å bygge en så stor graf av tillit som mulig',
    'Du inviterer folk du kjenner personlig — det er din første håndtrykksirkel',
    'De inviterer sine — og nettverket vokser videre, sirkel for sirkel',
    'Jo større nettverket er, desto raskere kommer hjelpen når den trengs'], next: 'Og nå — slik gjør du det' },
  fi: { title: 'Miksi?', sub: 'Keskinäisen avun verkosto oikeista tuttavista', points: [
    'Tavoite on rakentaa mahdollisimman suuri luottamuksen verkko',
    'Kutsut ihmisiä, jotka tunnet henkilökohtaisesti — ensimmäinen kättelypiirisi',
    'He kutsuvat omiaan — ja verkosto kasvaa piiri piiriltä',
    'Mitä suurempi verkosto, sitä nopeammin apu tulee, kun sitä tarvitaan'], next: 'Ja nyt — näin se tehdään' },
  tr: { title: 'Neden?', sub: 'Birbirini gerçekten tanıyan insanlardan oluşan bir yardımlaşma ağı', points: [
    'Amaç, mümkün olan en büyük güven grafını kurmak',
    'Şahsen tanıdığınız kişileri davet edersiniz — bu sizin ilk tokalaşma çemberiniz',
    'Onlar da kendi tanıdıklarını davet eder — ve ağ çember çember büyür',
    'Ağ ne kadar büyükse, gerektiğinde yardım o kadar hızlı gelir'], next: 'Şimdi — nasıl yapılır' },
  vi: { title: 'Để làm gì?', sub: 'Mạng lưới tương trợ giữa những người thật sự quen biết', points: [
    'Mục tiêu là xây dựng đồ thị tin cậy lớn nhất có thể',
    'Bạn mời những người bạn quen biết trực tiếp — đó là vòng bắt tay đầu tiên của bạn',
    'Họ mời người quen của họ — và mạng lưới tiếp tục lớn lên, từng vòng một',
    'Mạng lưới càng lớn, sự giúp đỡ càng đến nhanh khi cần'], next: 'Bây giờ — làm thế nào' },
  id: { title: 'Untuk apa?', sub: 'Jaringan saling bantu dari orang-orang yang benar-benar saling kenal', points: [
    'Tujuannya membangun graf kepercayaan sebesar mungkin',
    'Anda mengundang orang yang Anda kenal secara pribadi — lingkaran jabat tangan pertama Anda',
    'Mereka mengundang kenalan mereka — dan jaringan terus tumbuh, lingkaran demi lingkaran',
    'Makin besar jaringannya, makin cepat bantuan datang saat dibutuhkan'], next: 'Sekarang — caranya' },
  ar: { title: 'لماذا؟', sub: 'شبكة للمساعدة المتبادلة بين أشخاص يعرفون بعضهم حقًا', points: [
    'الهدف هو بناء أكبر شبكة ثقة ممكنة',
    'تدعو من تعرفهم شخصيًا — هذه دائرة المصافحة الأولى لديك',
    'وهم يدعون معارفهم — فتكبر الشبكة دائرة بعد دائرة',
    'كلما كبرت الشبكة، وصلت المساعدة أسرع عند الحاجة'], next: 'والآن — كيف تفعل ذلك' },
  he: { title: 'למה?', sub: 'רשת של עזרה הדדית בין אנשים שבאמת מכירים זה את זה', points: [
    'המטרה היא לבנות גרף אמון גדול ככל האפשר',
    'אתם מזמינים אנשים שאתם מכירים אישית — זה מעגל לחיצות הידיים הראשון שלכם',
    'הם מזמינים את המכרים שלהם — והרשת ממשיכה לגדול, מעגל אחר מעגל',
    'ככל שהרשת גדולה יותר, העזרה מגיעה מהר יותר כשצריך'], next: 'ועכשיו — איך עושים את זה' },
  hi: { title: 'क्यों?', sub: 'असली जान-पहचान वालों का आपसी मदद का नेटवर्क', points: [
    'लक्ष्य है भरोसे का जितना हो सके उतना बड़ा ग्राफ़ बनाना',
    'आप उन्हें आमंत्रित करते हैं जिन्हें आप निजी तौर पर जानते हैं — यह आपका पहला हैंडशेक घेरा है',
    'वे अपने लोगों को आमंत्रित करते हैं — और नेटवर्क घेरा-दर-घेरा बढ़ता है',
    'नेटवर्क जितना बड़ा, ज़रूरत पड़ने पर मदद उतनी जल्दी'], next: 'अब — यह कैसे करें' },
  th: { title: 'ทำไม?', sub: 'เครือข่ายช่วยเหลือกันจากคนที่รู้จักกันจริง', points: [
    'เป้าหมายคือสร้างกราฟความไว้ใจให้ใหญ่ที่สุด',
    'คุณเชิญคนที่รู้จักเป็นการส่วนตัว — นี่คือวงจับมือวงแรกของคุณ',
    'พวกเขาเชิญคนของพวกเขา — และเครือข่ายก็เติบโตต่อไปทีละวง',
    'ยิ่งเครือข่ายใหญ่ ความช่วยเหลือก็ยิ่งมาถึงเร็วเมื่อต้องการ'], next: 'ต่อไป — ทำอย่างไร' },
  zh: { title: '为什么?', sub: '由真正相识的人组成的互助网络', points: [
    '目标是建立尽可能大的信任图谱',
    '你邀请亲自认识的人——这是你的第一圈握手',
    '他们再邀请自己认识的人——网络一圈一圈地扩大',
    '网络越大,需要时帮助来得越快'], next: '接下来——怎么做' },
  ja: { title: 'なぜ?', sub: '本当に知り合い同士でつくる助け合いのネットワーク', points: [
    '目標は、できるだけ大きな信頼のグラフをつくること',
    '直接知っている人を招待します——これが最初の握手の輪です',
    '招待された人も自分の知り合いを招待——ネットワークは輪ごとに広がります',
    'ネットワークが大きいほど、必要なときに早く助けが届きます'], next: 'では——やり方です' },
  ko: { title: '왜?', sub: '실제로 아는 사람들로 이루어진 상호 도움 네트워크', points: [
    '목표는 가능한 한 큰 신뢰 그래프를 만드는 것입니다',
    '직접 아는 사람을 초대하세요 — 이것이 첫 번째 악수 고리입니다',
    '그들이 자기 지인을 초대하고 — 네트워크는 고리마다 커집니다',
    '네트워크가 클수록 필요할 때 도움이 더 빨리 옵니다'], next: '이제 — 방법입니다' },
};

const BG = '#0f172a';
const FONT = "'Segoe UI','Nirmala UI','Leelawadee UI','Microsoft YaHei','Yu Gothic UI','Malgun Gothic',sans-serif";
const RTL = new Set(['ar', 'he']);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** "You" in the middle, then rings of people: 1st handshake circle, their circles, and so on (`rings` = how many are drawn). */
function graphSvg(rings, size) {
  const c = 200;
  const RING = [
    { r: 0, n: 1, node: 20, color: '#2dd4bf' },
    { r: 70, n: 6, node: 12, color: '#60a5fa' },
    { r: 128, n: 12, node: 9, color: '#818cf8' },
    { r: 182, n: 20, node: 6, color: '#a5b4fc' },
  ];
  const at = (k, i) => {
    const { r, n } = RING[k];
    const a = (2 * Math.PI * i) / n - Math.PI / 2 + k * 0.17;
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  let edges = '', nodes = '';
  for (let k = 0; k <= rings; k++) {
    const { n, node, color } = RING[k];
    for (let i = 0; i < n; i++) {
      const [x, y] = at(k, i);
      if (k > 0) {
        const parent = Math.floor((i * RING[k - 1].n) / n);
        const [px, py] = at(k - 1, parent);
        edges += `<line x1="${px.toFixed(1)}" y1="${py.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${color}" stroke-opacity=".55" stroke-width="2"/>`;
      }
      nodes += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${node}" fill="${color}"${k === 0 ? ' stroke="#ccfbf1" stroke-width="4"' : ''}/>`;
    }
  }
  return `<svg viewBox="0 0 400 400" width="${size}" height="${size}">${edges}${nodes}</svg>`;
}

const pointsHtml = (w, shown) => w.points.map((p, i) =>
  `<li style="opacity:${i < shown ? 1 : 0}"><i>${i + 1}</i><span>${esc(p)}</span></li>`).join('');

const STYLE = `*{box-sizing:border-box}body{margin:0;background:${BG};font-family:${FONT};color:#fff}
  h1{margin:0;font-size:var(--h);font-weight:800;color:#5eead4}p.sub{margin:6px 0 0;color:#c7d2fe;font-size:var(--s)}
  ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:var(--g)}
  li{display:flex;gap:14px;align-items:flex-start;font-size:var(--p);line-height:1.3}
  li i{flex:none;font-style:normal;font-weight:700;width:1.6em;height:1.6em;border-radius:50%;background:#1e3a8a;color:#bfdbfe;display:flex;align-items:center;justify-content:center;font-size:.8em;margin-top:.05em}
  .next{color:#fbbf24;font-weight:700;font-size:var(--p)}`;

/** Shrinks the text until #w fits its box (long languages). */
async function fit(page, box) {
  await page.evaluate((h) => {
    const w = document.getElementById('w');
    let k = 1;
    const base = { h: 54, s: 26, p: 28, g: 16 };
    const set = () => { for (const [n, v] of Object.entries(base)) w.style.setProperty(`--${n}`, `${(v * k).toFixed(1)}px`); };
    set();
    while (w.scrollHeight > h && k > 0.6) { k -= 0.03; set(); }
  }, box);
}

/** Video intro stages: [png, seconds]. Each stage adds one ring of the graph and one point. */
async function renderStages(browser, l, dir) {
  const w = WHY[l] ?? WHY.en;
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
  const out = [];
  const DUR = [3.5, 4.5, 4.5, 5.5];
  for (let s = 0; s < 4; s++) {
    await page.setContent(`<!doctype html><html lang="${l}" dir="auto"><body><style>${STYLE}</style>
      <div id="w" dir="auto" style="width:720px;height:1280px;padding:80px 56px 60px;display:flex;flex-direction:column;align-items:center;gap:22px;overflow:hidden">
        <div style="text-align:center"><h1>${esc(w.title)}</h1><p class="sub">${esc(w.sub)}</p></div>
        ${graphSvg(s, 440)}
        <ul style="width:100%">${pointsHtml(w, s + 1)}</ul>
        <div class="next" style="opacity:${s === 3 ? 1 : 0};margin-top:auto">${esc(w.next)} ${RTL.has(l) ? '←' : '→'}</div>
      </div></body></html>`);
    await fit(page, 1280);
    const f = path.join(dir, `why${s}.png`);
    await page.screenshot({ path: f, scale: 'css' });
    out.push([f, DUR[s]]);
  }
  await page.close();
  return out;
}

function ffmpeg(args) {
  const bin = process.env.FFMPEG || 'C:/ffmpeg/bin/ffmpeg.exe';
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', (d) => { err += d; });
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(err.slice(-800)))));
  });
}

/** Re-encodes `mp4` (720x1280, 25 fps) with the "why" intro in front of it. */
export async function prependWhyVideo(browser, l, mp4) {
  const dir = path.join(os.tmpdir(), `so-why-${l}-${path.basename(path.dirname(mp4))}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const stages = await renderStages(browser, l, dir);
  const FADE = 0.25;
  const total = stages.reduce((a, [, d]) => a + d, 0);
  const n = stages.length;
  const filter = [
    ...stages.map(([, d], i) => `[${i}:v]fps=25,format=yuv420p,setsar=1${i === 0 ? `,fade=t=in:st=0:d=${FADE}:color=${BG}` : ''}${i === n - 1 ? `,fade=t=out:st=${(d - FADE).toFixed(2)}:d=${FADE}:color=${BG}` : ''}[s${i}]`),
    `[${n}:v]fps=25,format=yuv420p,setsar=1,fade=t=in:st=0:d=${FADE}:color=${BG}[how]`,
    `${stages.map((_, i) => `[s${i}]`).join('')}[how]concat=n=${n + 1}:v=1:a=0[v]`,
  ].join(';');
  const tmp = path.join(dir, 'out.mp4');
  await ffmpeg(['-y', ...stages.flatMap(([f, d]) => ['-loop', '1', '-framerate', '25', '-t', String(d), '-i', f]), '-i', mp4,
    '-filter_complex', filter, '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmp]);
  renameSync(tmp, mp4);
  rmSync(dir, { recursive: true, force: true });
  return total;
}

/** Re-renders the illustration sheet `jpg` with the "why" banner on top. */
export async function addWhyBanner(browser, l, jpg) {
  const w = WHY[l] ?? WHY.en;
  const img = readFileSync(jpg).toString('base64');
  const page = await browser.newPage({ viewport: { width: 1720, height: 800 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html lang="${l}" dir="auto"><body><style>${STYLE}</style>
    <section dir="auto" style="display:flex;align-items:center;gap:48px;margin:28px 20px 0;padding:28px 48px;border-radius:24px;background:#16213b;border:1px solid rgba(94,234,212,.25)">
      ${graphSvg(3, 360)}
      <div id="w" style="flex:1;display:flex;flex-direction:column;gap:22px;--h:54px;--s:26px;--p:28px;--g:14px">
        <div><h1>${esc(w.title)}</h1><p class="sub">${esc(w.sub)}</p></div>
        <ul>${pointsHtml(w, 4)}</ul>
        <div class="next">${esc(w.next)} ↓</div>
      </div>
    </section>
    <img style="display:block;width:1720px" src="data:image/jpeg;base64,${img}"></body></html>`);
  const buf = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 85, scale: 'css' });
  await page.close();
  writeFileSync(jpg, buf);
}
