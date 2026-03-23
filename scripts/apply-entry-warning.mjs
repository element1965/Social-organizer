import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, '..', 'packages', 'i18n', 'locales');

const translations = {
  ar: {
    entryWarningTitle: 'انتظر قليلاً',
    entryWarningText: 'إنشاء طلب المساعدة سيُرسل إشعاراً لعشرات الأشخاص في شبكتك. إذا كنت تستكشف التطبيق فقط — لا تُنشئ طلباً حقيقياً. هذه الأداة مخصصة لمن يحتاجون المساعدة فعلاً.',
    entryWarningProceed: 'أفهم، متابعة',
    entryWarningBack: 'العودة',
  },
  bn: {
    entryWarningTitle: 'একটু থামুন',
    entryWarningText: 'সাহায্যের অনুরোধ তৈরি করলে আপনার নেটওয়ার্কের কয়েক ডজন মানুষকে বিজ্ঞপ্তি পাঠানো হবে। আপনি যদি শুধু অ্যাপটি দেখছেন — আসল অনুরোধ তৈরি করবেন না। এই টুল তাদের জন্য যাদের সত্যিই সাহায্য দরকার।',
    entryWarningProceed: 'বুঝেছি, এগিয়ে যান',
    entryWarningBack: 'ফিরে যান',
  },
  da: {
    entryWarningTitle: 'Vent et øjeblik',
    entryWarningText: 'At oprette en hjælpeanmodning sender en notifikation til snesevis af mennesker i dit netværk. Hvis du bare udforsker appen — opret ikke en rigtig anmodning. Dette værktøj er til dem, der virkelig har brug for hjælp.',
    entryWarningProceed: 'Jeg forstår, fortsæt',
    entryWarningBack: 'Gå tilbage',
  },
  de: {
    entryWarningTitle: 'Einen Moment',
    entryWarningText: 'Eine Hilfeanfrage zu erstellen sendet eine Benachrichtigung an Dutzende von Menschen in Ihrem Netzwerk. Wenn Sie nur die App erkunden — erstellen Sie keine echte Anfrage. Dieses Tool ist für diejenigen gedacht, die wirklich Hilfe brauchen.',
    entryWarningProceed: 'Verstanden, weiter',
    entryWarningBack: 'Zurück',
  },
  el: {
    entryWarningTitle: 'Περιμένετε λίγο',
    entryWarningText: 'Η δημιουργία αιτήματος βοήθειας θα στείλει ειδοποίηση σε δεκάδες ανθρώπους στο δίκτυό σας. Αν απλά εξερευνάτε την εφαρμογή — μη δημιουργείτε πραγματικό αίτημα. Αυτό το εργαλείο είναι για όσους χρειάζονται πραγματικά βοήθεια.',
    entryWarningProceed: 'Καταλαβαίνω, συνέχεια',
    entryWarningBack: 'Πίσω',
  },
  es: {
    entryWarningTitle: 'Un momento',
    entryWarningText: 'Crear una solicitud de ayuda enviará una notificación a decenas de personas en tu red. Si solo estás explorando la aplicación — no crees una solicitud real. Esta herramienta es para quienes realmente necesitan ayuda.',
    entryWarningProceed: 'Entiendo, continuar',
    entryWarningBack: 'Volver',
  },
  fa: {
    entryWarningTitle: 'یک لحظه صبر کنید',
    entryWarningText: 'ایجاد درخواست کمک به ده‌ها نفر در شبکه شما اطلاع‌رسانی می‌کند. اگر فقط در حال بررسی برنامه هستید — درخواست واقعی ایجاد نکنید. این ابزار برای کسانی است که واقعاً به کمک نیاز دارند.',
    entryWarningProceed: 'متوجه شدم، ادامه',
    entryWarningBack: 'بازگشت',
  },
  fi: {
    entryWarningTitle: 'Hetkinen',
    entryWarningText: 'Avunpyynnön luominen lähettää ilmoituksen kymmenille ihmisille verkostossasi. Jos vain tutkit sovellusta — älä luo oikeaa pyyntöä. Tämä työkalu on tarkoitettu niille, jotka todella tarvitsevat apua.',
    entryWarningProceed: 'Ymmärrän, jatka',
    entryWarningBack: 'Takaisin',
  },
  fr: {
    entryWarningTitle: 'Un instant',
    entryWarningText: "Créer une demande d'aide enverra une notification à des dizaines de personnes de votre réseau. Si vous explorez simplement l'application, ne créez pas de vraie demande. Cet outil est destiné à ceux qui ont vraiment besoin d'aide.",
    entryWarningProceed: 'Je comprends, continuer',
    entryWarningBack: 'Retour',
  },
  he: {
    entryWarningTitle: 'רגע אחד',
    entryWarningText: 'יצירת בקשת עזרה תשלח התראה לעשרות אנשים ברשת שלך. אם אתה רק בוחן את האפליקציה — אל תיצור בקשה אמיתית. כלי זה מיועד למי שבאמת צריך עזרה.',
    entryWarningProceed: 'הבנתי, המשך',
    entryWarningBack: 'חזרה',
  },
  hi: {
    entryWarningTitle: 'एक पल रुकें',
    entryWarningText: 'सहायता अनुरोध बनाने से आपके नेटवर्क में दर्जनों लोगों को सूचना भेजी जाएगी। यदि आप केवल ऐप को देख रहे हैं — वास्तविक अनुरोध न बनाएं। यह टूल उनके लिए है जिन्हें वास्तव में सहायता की आवश्यकता है।',
    entryWarningProceed: 'समझ गया, आगे बढ़ें',
    entryWarningBack: 'वापस जाएं',
  },
  hu: {
    entryWarningTitle: 'Egy pillanat',
    entryWarningText: 'A segítségkérés létrehozása értesítést küld tucatnyi embernek a hálózatodban. Ha csak felfedezed az alkalmazást — ne hozz létre valódi kérést. Ez az eszköz azoknak szól, akiknek valóban segítségre van szükségük.',
    entryWarningProceed: 'Értem, tovább',
    entryWarningBack: 'Vissza',
  },
  id: {
    entryWarningTitle: 'Tunggu sebentar',
    entryWarningText: 'Membuat permintaan bantuan akan mengirim notifikasi ke puluhan orang di jaringan Anda. Jika Anda hanya menjelajahi aplikasi — jangan buat permintaan nyata. Alat ini untuk mereka yang benar-benar membutuhkan bantuan.',
    entryWarningProceed: 'Saya mengerti, lanjutkan',
    entryWarningBack: 'Kembali',
  },
  it: {
    entryWarningTitle: 'Un momento',
    entryWarningText: "Creare una richiesta di aiuto invierà una notifica a decine di persone nella tua rete. Se stai solo esplorando l'app — non creare una richiesta reale. Questo strumento è per chi ha davvero bisogno di aiuto.",
    entryWarningProceed: 'Capisco, continua',
    entryWarningBack: 'Indietro',
  },
  ja: {
    entryWarningTitle: 'ちょっと待ってください',
    entryWarningText: '援助リクエストを作成すると、ネットワーク内の数十人に通知が送信されます。アプリを探索しているだけなら、実際のリクエストを作成しないでください。このツールは本当に助けが必要な人のためのものです。',
    entryWarningProceed: '理解しました、続ける',
    entryWarningBack: '戻る',
  },
  ko: {
    entryWarningTitle: '잠깐만요',
    entryWarningText: '도움 요청을 만들면 네트워크의 수십 명에게 알림이 전송됩니다. 앱을 둘러보는 중이라면 실제 요청을 만들지 마세요. 이 도구는 정말로 도움이 필요한 사람들을 위한 것입니다.',
    entryWarningProceed: '이해했습니다, 계속',
    entryWarningBack: '돌아가기',
  },
  ms: {
    entryWarningTitle: 'Tunggu sebentar',
    entryWarningText: 'Membuat permintaan bantuan akan menghantar pemberitahuan kepada berpuluh-puluh orang dalam rangkaian anda. Jika anda hanya meneroka aplikasi — jangan buat permintaan sebenar. Alat ini untuk mereka yang benar-benar memerlukan bantuan.',
    entryWarningProceed: 'Saya faham, teruskan',
    entryWarningBack: 'Kembali',
  },
  nl: {
    entryWarningTitle: 'Even wachten',
    entryWarningText: 'Het aanmaken van een hulpverzoek stuurt een melding naar tientallen mensen in uw netwerk. Als u alleen de app verkent — maak geen echt verzoek aan. Deze tool is voor mensen die echt hulp nodig hebben.',
    entryWarningProceed: 'Ik begrijp het, doorgaan',
    entryWarningBack: 'Terug',
  },
  no: {
    entryWarningTitle: 'Vent litt',
    entryWarningText: 'Å opprette en hjelpeforespørsel sender en varsling til titalls mennesker i nettverket ditt. Hvis du bare utforsker appen — ikke opprett en ekte forespørsel. Dette verktøyet er for de som virkelig trenger hjelp.',
    entryWarningProceed: 'Jeg forstår, fortsett',
    entryWarningBack: 'Tilbake',
  },
  pl: {
    entryWarningTitle: 'Chwileczkę',
    entryWarningText: 'Utworzenie prośby o pomoc wyśle powiadomienie do kilkudziesięciu osób w Twojej sieci. Jeśli tylko przeglądasz aplikację — nie twórz prawdziwej prośby. To narzędzie jest dla tych, którzy naprawdę potrzebują pomocy.',
    entryWarningProceed: 'Rozumiem, kontynuuj',
    entryWarningBack: 'Wróć',
  },
  pt: {
    entryWarningTitle: 'Um momento',
    entryWarningText: 'Criar um pedido de ajuda enviará uma notificação para dezenas de pessoas na sua rede. Se você está apenas explorando o aplicativo — não crie um pedido real. Esta ferramenta é para quem realmente precisa de ajuda.',
    entryWarningProceed: 'Entendi, continuar',
    entryWarningBack: 'Voltar',
  },
  sv: {
    entryWarningTitle: 'Vänta lite',
    entryWarningText: 'Att skapa en hjälpförfrågan skickar en notifikation till dussintals personer i ditt nätverk. Om du bara utforskar appen — skapa inte en riktig förfrågan. Detta verktyg är för dem som verkligen behöver hjälp.',
    entryWarningProceed: 'Jag förstår, fortsätt',
    entryWarningBack: 'Tillbaka',
  },
  th: {
    entryWarningTitle: 'รอสักครู่',
    entryWarningText: 'การสร้างคำขอความช่วยเหลือจะส่งการแจ้งเตือนไปยังผู้คนนับสิบในเครือข่ายของคุณ หากคุณแค่สำรวจแอป — อย่าสร้างคำขอจริง เครื่องมือนี้สำหรับผู้ที่ต้องการความช่วยเหลือจริงๆ',
    entryWarningProceed: 'เข้าใจแล้ว ดำเนินการต่อ',
    entryWarningBack: 'ย้อนกลับ',
  },
  tr: {
    entryWarningTitle: 'Bir dakika',
    entryWarningText: 'Yardım talebi oluşturmak ağınızdaki onlarca kişiye bildirim gönderecektir. Sadece uygulamayı keşfediyorsanız — gerçek bir talep oluşturmayın. Bu araç gerçekten yardıma ihtiyacı olanlar içindir.',
    entryWarningProceed: 'Anlıyorum, devam et',
    entryWarningBack: 'Geri dön',
  },
  uk: {
    entryWarningTitle: 'Зачекайте',
    entryWarningText: 'Створення запиту на допомогу надішле сповіщення десяткам людей у вашій мережі. Якщо ви просто досліджуєте додаток — не створюйте справжній запит. Цей інструмент для тих, хто дійсно потребує допомоги.',
    entryWarningProceed: 'Розумію, продовжити',
    entryWarningBack: 'Назад',
  },
};

for (const [lang, keys] of Object.entries(translations)) {
  const filePath = path.join(localesDir, `${lang}.json`);
  if (!fs.existsSync(filePath)) {
    console.log(`Skip ${lang} — file not found`);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (!data.create) data.create = {};
  data.create.entryWarningTitle = keys.entryWarningTitle;
  data.create.entryWarningText = keys.entryWarningText;
  data.create.entryWarningProceed = keys.entryWarningProceed;
  data.create.entryWarningBack = keys.entryWarningBack;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`Updated ${lang}.json`);
}

console.log('Done!');
