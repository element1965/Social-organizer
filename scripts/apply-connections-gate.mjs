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
    notEnoughConnectionsTitle: 'لا توجد اتصالات كافية',
    notEnoughConnectionsText: 'لإنشاء إشارة مساعدة، تحتاج إلى {{min}} اتصال على الأقل في شبكتك. ادعُ المزيد من الأشخاص لفتح هذه الميزة.',
    connectionsRemaining: 'تحتاج {{count}} إضافية',
    goToNetwork: 'دعوة أشخاص',
  },
  da: {
    entryWarningTitle: 'Vent et øjeblik',
    entryWarningText: 'At oprette en hjælpeanmodning sender en notifikation til snesevis af mennesker i dit netværk. Hvis du bare udforsker appen — opret ikke en rigtig anmodning. Dette værktøj er til dem, der virkelig har brug for hjælp.',
    entryWarningProceed: 'Jeg forstår, fortsæt',
    entryWarningBack: 'Gå tilbage',
    notEnoughConnectionsTitle: 'Ikke nok forbindelser',
    notEnoughConnectionsText: 'For at oprette et hjælpesignal skal du have mindst {{min}} forbindelser i dit netværk. Inviter flere mennesker for at låse denne funktion op.',
    connectionsRemaining: '{{count}} mere nødvendigt',
    goToNetwork: 'Inviter mennesker',
  },
  de: {
    entryWarningTitle: 'Einen Moment',
    entryWarningText: 'Eine Hilfeanfrage zu erstellen sendet eine Benachrichtigung an Dutzende von Menschen in Ihrem Netzwerk. Wenn Sie nur die App erkunden — erstellen Sie keine echte Anfrage. Dieses Tool ist für diejenigen gedacht, die wirklich Hilfe brauchen.',
    entryWarningProceed: 'Verstanden, weiter',
    entryWarningBack: 'Zurück',
    notEnoughConnectionsTitle: 'Nicht genügend Verbindungen',
    notEnoughConnectionsText: 'Um ein Hilfesignal zu erstellen, benötigen Sie mindestens {{min}} Verbindungen in Ihrem Netzwerk. Laden Sie mehr Personen ein, um diese Funktion freizuschalten.',
    connectionsRemaining: 'Noch {{count}} benötigt',
    goToNetwork: 'Personen einladen',
  },
  es: {
    entryWarningTitle: 'Un momento',
    entryWarningText: 'Crear una solicitud de ayuda enviará una notificación a decenas de personas en tu red. Si solo estás explorando la aplicación — no crees una solicitud real. Esta herramienta es para quienes realmente necesitan ayuda.',
    entryWarningProceed: 'Entiendo, continuar',
    entryWarningBack: 'Volver',
    notEnoughConnectionsTitle: 'No hay suficientes conexiones',
    notEnoughConnectionsText: 'Para crear una señal de ayuda, necesitas al menos {{min}} conexiones en tu red. Invita a más personas para desbloquear esta función.',
    connectionsRemaining: 'Faltan {{count}} más',
    goToNetwork: 'Invitar personas',
  },
  fi: {
    entryWarningTitle: 'Hetkinen',
    entryWarningText: 'Avunpyynnön luominen lähettää ilmoituksen kymmenille ihmisille verkostossasi. Jos vain tutkit sovellusta — älä luo oikeaa pyyntöä. Tämä työkalu on tarkoitettu niille, jotka todella tarvitsevat apua.',
    entryWarningProceed: 'Ymmärrän, jatka',
    entryWarningBack: 'Takaisin',
    notEnoughConnectionsTitle: 'Ei tarpeeksi yhteyksiä',
    notEnoughConnectionsText: 'Avunpyynnön luomiseen tarvitset vähintään {{min}} yhteyttä verkostossasi. Kutsu lisää ihmisiä avataksesi tämän toiminnon.',
    connectionsRemaining: 'Tarvitaan vielä {{count}}',
    goToNetwork: 'Kutsu ihmisiä',
  },
  fr: {
    entryWarningTitle: 'Un instant',
    entryWarningText: "Créer une demande d'aide enverra une notification à des dizaines de personnes de votre réseau. Si vous explorez simplement l'application, ne créez pas de vraie demande. Cet outil est destiné à ceux qui ont vraiment besoin d'aide.",
    entryWarningProceed: 'Je comprends, continuer',
    entryWarningBack: 'Retour',
    notEnoughConnectionsTitle: 'Pas assez de connexions',
    notEnoughConnectionsText: "Pour créer un signal d'aide, vous avez besoin d'au moins {{min}} connexions dans votre réseau. Invitez plus de personnes pour débloquer cette fonctionnalité.",
    connectionsRemaining: 'Encore {{count}} nécessaires',
    goToNetwork: 'Inviter des personnes',
  },
  he: {
    entryWarningTitle: 'רגע אחד',
    entryWarningText: 'יצירת בקשת עזרה תשלח התראה לעשרות אנשים ברשת שלך. אם אתה רק בוחן את האפליקציה — אל תיצור בקשה אמיתית. כלי זה מיועד למי שבאמת צריך עזרה.',
    entryWarningProceed: 'הבנתי, המשך',
    entryWarningBack: 'חזרה',
    notEnoughConnectionsTitle: 'אין מספיק חיבורים',
    notEnoughConnectionsText: 'כדי ליצור אות עזרה, אתה צריך לפחות {{min}} חיבורים ברשת שלך. הזמן עוד אנשים כדי לפתוח תכונה זו.',
    connectionsRemaining: 'צריך עוד {{count}}',
    goToNetwork: 'הזמן אנשים',
  },
  hi: {
    entryWarningTitle: 'एक पल रुकें',
    entryWarningText: 'सहायता अनुरोध बनाने से आपके नेटवर्क में दर्जनों लोगों को सूचना भेजी जाएगी। यदि आप केवल ऐप को देख रहे हैं — वास्तविक अनुरोध न बनाएं। यह टूल उनके लिए है जिन्हें वास्तव में सहायता की आवश्यकता है।',
    entryWarningProceed: 'समझ गया, आगे बढ़ें',
    entryWarningBack: 'वापस जाएं',
    notEnoughConnectionsTitle: 'पर्याप्त कनेक्शन नहीं',
    notEnoughConnectionsText: 'सहायता सिग्नल बनाने के लिए आपके नेटवर्क में कम से कम {{min}} कनेक्शन होने चाहिए। इस सुविधा को अनलॉक करने के लिए और लोगों को आमंत्रित करें।',
    connectionsRemaining: 'और {{count}} की जरूरत',
    goToNetwork: 'लोगों को आमंत्रित करें',
  },
  id: {
    entryWarningTitle: 'Tunggu sebentar',
    entryWarningText: 'Membuat permintaan bantuan akan mengirim notifikasi ke puluhan orang di jaringan Anda. Jika Anda hanya menjelajahi aplikasi — jangan buat permintaan nyata. Alat ini untuk mereka yang benar-benar membutuhkan bantuan.',
    entryWarningProceed: 'Saya mengerti, lanjutkan',
    entryWarningBack: 'Kembali',
    notEnoughConnectionsTitle: 'Koneksi tidak cukup',
    notEnoughConnectionsText: 'Untuk membuat sinyal bantuan, Anda membutuhkan minimal {{min}} koneksi di jaringan Anda. Undang lebih banyak orang untuk membuka fitur ini.',
    connectionsRemaining: 'Butuh {{count}} lagi',
    goToNetwork: 'Undang orang',
  },
  it: {
    entryWarningTitle: 'Un momento',
    entryWarningText: "Creare una richiesta di aiuto invierà una notifica a decine di persone nella tua rete. Se stai solo esplorando l'app — non creare una richiesta reale. Questo strumento è per chi ha davvero bisogno di aiuto.",
    entryWarningProceed: 'Capisco, continua',
    entryWarningBack: 'Indietro',
    notEnoughConnectionsTitle: 'Connessioni insufficienti',
    notEnoughConnectionsText: "Per creare un segnale d'aiuto, hai bisogno di almeno {{min}} connessioni nella tua rete. Invita più persone per sbloccare questa funzione.",
    connectionsRemaining: 'Ne servono ancora {{count}}',
    goToNetwork: 'Invita persone',
  },
  ja: {
    entryWarningTitle: 'ちょっと待ってください',
    entryWarningText: '援助リクエストを作成すると、ネットワーク内の数十人に通知が送信されます。アプリを探索しているだけなら、実際のリクエストを作成しないでください。このツールは本当に助けが必要な人のためのものです。',
    entryWarningProceed: '理解しました、続ける',
    entryWarningBack: '戻る',
    notEnoughConnectionsTitle: '接続が不足しています',
    notEnoughConnectionsText: 'ヘルプシグナルを作成するには、ネットワークに最低{{min}}の接続が必要です。この機能をアンロックするには、もっと多くの人を招待してください。',
    connectionsRemaining: 'あと{{count}}人必要',
    goToNetwork: '人を招待する',
  },
  ko: {
    entryWarningTitle: '잠깐만요',
    entryWarningText: '도움 요청을 만들면 네트워크의 수십 명에게 알림이 전송됩니다. 앱을 둘러보는 중이라면 실제 요청을 만들지 마세요. 이 도구는 정말로 도움이 필요한 사람들을 위한 것입니다.',
    entryWarningProceed: '이해했습니다, 계속',
    entryWarningBack: '돌아가기',
    notEnoughConnectionsTitle: '연결이 부족합니다',
    notEnoughConnectionsText: '도움 신호를 만들려면 네트워크에 최소 {{min}}개의 연결이 필요합니다. 이 기능을 잠금 해제하려면 더 많은 사람을 초대하세요.',
    connectionsRemaining: '{{count}}명 더 필요',
    goToNetwork: '사람 초대하기',
  },
  nl: {
    entryWarningTitle: 'Even wachten',
    entryWarningText: 'Het aanmaken van een hulpverzoek stuurt een melding naar tientallen mensen in uw netwerk. Als u alleen de app verkent — maak geen echt verzoek aan. Deze tool is voor mensen die echt hulp nodig hebben.',
    entryWarningProceed: 'Ik begrijp het, doorgaan',
    entryWarningBack: 'Terug',
    notEnoughConnectionsTitle: 'Niet genoeg verbindingen',
    notEnoughConnectionsText: 'Om een hulpsignaal te maken, heb je minstens {{min}} verbindingen in je netwerk nodig. Nodig meer mensen uit om deze functie te ontgrendelen.',
    connectionsRemaining: 'Nog {{count}} nodig',
    goToNetwork: 'Mensen uitnodigen',
  },
  no: {
    entryWarningTitle: 'Vent litt',
    entryWarningText: 'Å opprette en hjelpeforespørsel sender en varsling til titalls mennesker i nettverket ditt. Hvis du bare utforsker appen — ikke opprett en ekte forespørsel. Dette verktøyet er for de som virkelig trenger hjelp.',
    entryWarningProceed: 'Jeg forstår, fortsett',
    entryWarningBack: 'Tilbake',
    notEnoughConnectionsTitle: 'Ikke nok forbindelser',
    notEnoughConnectionsText: 'For å opprette et hjelpesignal trenger du minst {{min}} forbindelser i nettverket ditt. Inviter flere mennesker for å låse opp denne funksjonen.',
    connectionsRemaining: '{{count}} til trengs',
    goToNetwork: 'Inviter mennesker',
  },
  pl: {
    entryWarningTitle: 'Chwileczkę',
    entryWarningText: 'Utworzenie prośby o pomoc wyśle powiadomienie do kilkudziesięciu osób w Twojej sieci. Jeśli tylko przeglądasz aplikację — nie twórz prawdziwej prośby. To narzędzie jest dla tych, którzy naprawdę potrzebują pomocy.',
    entryWarningProceed: 'Rozumiem, kontynuuj',
    entryWarningBack: 'Wróć',
    notEnoughConnectionsTitle: 'Za mało połączeń',
    notEnoughConnectionsText: 'Aby utworzyć sygnał pomocy, potrzebujesz co najmniej {{min}} połączeń w swojej sieci. Zaproś więcej osób, aby odblokować tę funkcję.',
    connectionsRemaining: 'Potrzeba jeszcze {{count}}',
    goToNetwork: 'Zaproś osoby',
  },
  pt: {
    entryWarningTitle: 'Um momento',
    entryWarningText: 'Criar um pedido de ajuda enviará uma notificação para dezenas de pessoas na sua rede. Se você está apenas explorando o aplicativo — não crie um pedido real. Esta ferramenta é para quem realmente precisa de ajuda.',
    entryWarningProceed: 'Entendi, continuar',
    entryWarningBack: 'Voltar',
    notEnoughConnectionsTitle: 'Conexões insuficientes',
    notEnoughConnectionsText: 'Para criar um sinal de ajuda, você precisa de pelo menos {{min}} conexões na sua rede. Convide mais pessoas para desbloquear esta função.',
    connectionsRemaining: 'Faltam {{count}} mais',
    goToNetwork: 'Convidar pessoas',
  },
  sv: {
    entryWarningTitle: 'Vänta lite',
    entryWarningText: 'Att skapa en hjälpförfrågan skickar en notifikation till dussintals personer i ditt nätverk. Om du bara utforskar appen — skapa inte en riktig förfrågan. Detta verktyg är för dem som verkligen behöver hjälp.',
    entryWarningProceed: 'Jag förstår, fortsätt',
    entryWarningBack: 'Tillbaka',
    notEnoughConnectionsTitle: 'Inte tillräckligt med kontakter',
    notEnoughConnectionsText: 'För att skapa en hjälpsignal behöver du minst {{min}} kontakter i ditt nätverk. Bjud in fler personer för att låsa upp denna funktion.',
    connectionsRemaining: '{{count}} till behövs',
    goToNetwork: 'Bjud in personer',
  },
  th: {
    entryWarningTitle: 'รอสักครู่',
    entryWarningText: 'การสร้างคำขอความช่วยเหลือจะส่งการแจ้งเตือนไปยังผู้คนนับสิบในเครือข่ายของคุณ หากคุณแค่สำรวจแอป — อย่าสร้างคำขอจริง เครื่องมือนี้สำหรับผู้ที่ต้องการความช่วยเหลือจริงๆ',
    entryWarningProceed: 'เข้าใจแล้ว ดำเนินการต่อ',
    entryWarningBack: 'ย้อนกลับ',
    notEnoughConnectionsTitle: 'การเชื่อมต่อไม่เพียงพอ',
    notEnoughConnectionsText: 'ในการสร้างสัญญาณขอความช่วยเหลือ คุณต้องมีอย่างน้อย {{min}} การเชื่อมต่อในเครือข่ายของคุณ เชิญคนเพิ่มเพื่อปลดล็อคฟีเจอร์นี้',
    connectionsRemaining: 'ต้องการอีก {{count}}',
    goToNetwork: 'เชิญผู้คน',
  },
  tr: {
    entryWarningTitle: 'Bir dakika',
    entryWarningText: 'Yardım talebi oluşturmak ağınızdaki onlarca kişiye bildirim gönderecektir. Sadece uygulamayı keşfediyorsanız — gerçek bir talep oluşturmayın. Bu araç gerçekten yardıma ihtiyacı olanlar içindir.',
    entryWarningProceed: 'Anlıyorum, devam et',
    entryWarningBack: 'Geri dön',
    notEnoughConnectionsTitle: 'Yeterli bağlantı yok',
    notEnoughConnectionsText: 'Yardım sinyali oluşturmak için ağınızda en az {{min}} bağlantıya ihtiyacınız var. Bu özelliği açmak için daha fazla kişi davet edin.',
    connectionsRemaining: '{{count}} daha gerekli',
    goToNetwork: 'Kişileri davet et',
  },
  uk: {
    entryWarningTitle: 'Зачекайте',
    entryWarningText: 'Створення запиту на допомогу надішле сповіщення десяткам людей у вашій мережі. Якщо ви просто досліджуєте додаток — не створюйте справжній запит. Цей інструмент для тих, хто дійсно потребує допомоги.',
    entryWarningProceed: 'Розумію, продовжити',
    entryWarningBack: 'Назад',
    notEnoughConnectionsTitle: "Недостатньо зв'язків",
    notEnoughConnectionsText: "Для створення сигналу допомоги потрібно мінімум {{min}} зв'язків у вашій мережі. Запросіть більше людей, щоб розблокувати цю функцію.",
    connectionsRemaining: 'Потрібно ще {{count}}',
    goToNetwork: 'Запросити людей',
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
  for (const [key, value] of Object.entries(keys)) {
    data.create[key] = value;
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`Updated ${lang}.json`);
}

console.log('Done!');
