#!/usr/bin/env node
/**
 * Apply manually written translations for new keys to all 25 locales.
 * Also moves old onboarding.step5 (budget) → step6 and overwrites step5 with contacts.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.join(__dirname, '..', 'packages', 'i18n', 'locales');

const translations = {
  ar: {
    onboarding: {
      step5: {
        title: "كيف يمكن التواصل معك",
        text: "أضف طريقتين للتواصل على الأقل حتى يتمكن المشاركون من التنسيق معك عند تقديم المساعدة."
      },
      contactsRequired: "أضف طريقتين للتواصل على الأقل",
      contactsFilled: "مملوء: {{count}}/2"
    },
    dashboard: { communityChat: "دردشة المجتمع" },
    create: {
      confirmTitle: "تأكيد إنشاء الجمع",
      confirmText: "تأكد من أنك تحتاج هذا المبلغ فعلاً. سيرى عشرات الأشخاص إشارة المساعدة — استخدمها بمسؤولية.",
      confirmPayment: "هل يمكنك استقبال تحويلات دولية؟ قد يكون المشاركون من بلدان مختلفة. تأكد من أن لديك محفظة عملات رقمية أو PayPal أو Wise أو Revolut أو طريقة أخرى لاستقبال الأموال من الخارج.",
      confirmCheckbox: "لقد فكرت في الأمر وأؤكد",
      confirmButton: "تأكيد",
      cancelButton: "إلغاء"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "هذا هو معرّف الرابط الشخصي الخاص بك لروابط الدعوة. هذا ليس دعوة بحد ذاته — لا ترسله للآخرين. استخدم الروابط أعلاه لدعوة شخص ما." },
    requiredInfo: {
      contactsTitle: "أضف جهات الاتصال الخاصة بك",
      contactsText: "يلزم طريقتان للتواصل على الأقل لتنسيق المساعدة",
      budgetTitle: "ميزانية الدعم الشهرية",
      budgetText: "هذا المبلغ هو نيتك وليس التزاماً. لا يتم ربط أي بطاقة ولا يتم خصم أي أموال. أنت فقط تحدد كم أنت مستعد للمساعدة شهرياً.",
      next: "التالي",
      save: "حفظ ومتابعة",
      contactsFilled: "مملوء: {{count}}/2"
    }
  },
  cs: {
    onboarding: {
      step5: {
        title: "Jak vás kontaktovat",
        text: "Přidejte alespoň 2 způsoby kontaktu, aby se s vámi účastníci mohli koordinovat při poskytování pomoci."
      },
      contactsRequired: "Přidejte alespoň 2 kontakty",
      contactsFilled: "Vyplněno: {{count}}/2"
    },
    dashboard: { communityChat: "Chat komunity" },
    create: {
      confirmTitle: "Potvrdit vytvoření sbírky",
      confirmText: "Ujistěte se, že tuto částku opravdu potřebujete. Signál o pomoci uvidí desítky lidí — používejte ho zodpovědně.",
      confirmPayment: "Můžete přijímat mezinárodní převody? Účastníci mohou být z různých zemí. Ujistěte se, že máte kryptopeněženku, PayPal, Wise, Revolut nebo jiný způsob příjmu plateb ze zahraničí.",
      confirmCheckbox: "Promyslel/a jsem si to a potvrzuji",
      confirmButton: "Potvrdit",
      cancelButton: "Zrušit"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "Toto je vaše osobní ID odkazu pro pozvánky. NENÍ to samotná pozvánka — neposílejte ho lidem. K pozvání použijte odkazy výše." },
    requiredInfo: {
      contactsTitle: "Přidejte své kontakty",
      contactsText: "Pro koordinaci pomoci jsou potřeba alespoň 2 způsoby kontaktu",
      budgetTitle: "Měsíční rozpočet podpory",
      budgetText: "Tato částka je váš záměr, nikoli závazek. Žádná karta není propojena, žádné peníze nejsou strženy. Jednoduše uvedete, kolik jste ochotni pomoci měsíčně.",
      next: "Další",
      save: "Uložit a pokračovat",
      contactsFilled: "Vyplněno: {{count}}/2"
    }
  },
  da: {
    onboarding: {
      step5: {
        title: "Hvordan man kontakter dig",
        text: "Tilføj mindst 2 kontaktmetoder, så deltagerne kan koordinere med dig, når de yder hjælp."
      },
      contactsRequired: "Tilføj mindst 2 kontakter",
      contactsFilled: "Udfyldt: {{count}}/2"
    },
    dashboard: { communityChat: "Fællesskabs-chat" },
    create: {
      confirmTitle: "Bekræft oprettelse af indsamling",
      confirmText: "Sørg for, at du virkelig har brug for dette beløb. Hjælpesignalet vil blive set af snesevis af mennesker — brug det ansvarligt.",
      confirmPayment: "Kan du modtage internationale overførsler? Deltagere kan være fra forskellige lande. Sørg for, at du har en krypto-wallet, PayPal, Wise, Revolut eller en anden måde at modtage penge fra udlandet.",
      confirmCheckbox: "Jeg har tænkt det igennem og bekræfter",
      confirmButton: "Bekræft",
      cancelButton: "Annuller"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "Dette er dit personlige link-ID til invitations-URL'er. Det er IKKE en invitation i sig selv — send det ikke til folk. Brug linkene ovenfor til at invitere nogen." },
    requiredInfo: {
      contactsTitle: "Tilføj dine kontakter",
      contactsText: "Mindst 2 kontakter er nødvendige for koordinering af hjælp",
      budgetTitle: "Månedligt støttebudget",
      budgetText: "Dette beløb er din hensigt, ikke en forpligtelse. Intet kort er tilknyttet, ingen penge trækkes. Du angiver blot, hvor meget du er villig til at hjælpe pr. måned.",
      next: "Næste",
      save: "Gem og fortsæt",
      contactsFilled: "Udfyldt: {{count}}/2"
    }
  },
  de: {
    onboarding: {
      step5: {
        title: "Wie man Sie erreicht",
        text: "Fügen Sie mindestens 2 Kontaktmethoden hinzu, damit Teilnehmer sich mit Ihnen koordinieren können, wenn sie Hilfe leisten."
      },
      contactsRequired: "Fügen Sie mindestens 2 Kontakte hinzu",
      contactsFilled: "Ausgefüllt: {{count}}/2"
    },
    dashboard: { communityChat: "Community-Chat" },
    create: {
      confirmTitle: "Sammlung bestätigen",
      confirmText: "Stellen Sie sicher, dass Sie diesen Betrag wirklich benötigen. Das Hilfesignal wird von Dutzenden Menschen gesehen — nutzen Sie es verantwortungsvoll.",
      confirmPayment: "Können Sie internationale Überweisungen empfangen? Teilnehmer können aus verschiedenen Ländern sein. Stellen Sie sicher, dass Sie eine Krypto-Wallet, PayPal, Wise, Revolut oder eine andere Möglichkeit haben, Geld aus dem Ausland zu empfangen.",
      confirmCheckbox: "Ich habe es durchdacht und bestätige",
      confirmButton: "Bestätigen",
      cancelButton: "Abbrechen"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "Dies ist Ihre persönliche Link-ID für Einladungs-URLs. Es ist KEINE Einladung an sich — senden Sie es nicht an Leute. Verwenden Sie die obigen Links, um jemanden einzuladen." },
    requiredInfo: {
      contactsTitle: "Kontakte hinzufügen",
      contactsText: "Mindestens 2 Kontaktmethoden werden für die Koordination der Hilfe benötigt",
      budgetTitle: "Monatliches Unterstützungsbudget",
      budgetText: "Dieser Betrag ist Ihre Absicht, keine Verpflichtung. Es wird keine Karte verknüpft und kein Geld abgebucht. Sie geben einfach an, wie viel Sie bereit sind, monatlich zu helfen.",
      next: "Weiter",
      save: "Speichern und fortfahren",
      contactsFilled: "Ausgefüllt: {{count}}/2"
    }
  },
  es: {
    onboarding: {
      step5: {
        title: "Cómo contactarte",
        text: "Agrega al menos 2 métodos de contacto para que los participantes puedan coordinarse contigo al brindar ayuda."
      },
      contactsRequired: "Agrega al menos 2 contactos",
      contactsFilled: "Completados: {{count}}/2"
    },
    dashboard: { communityChat: "Chat de la comunidad" },
    create: {
      confirmTitle: "Confirmar creación de colecta",
      confirmText: "Asegúrate de que realmente necesitas esta cantidad. La señal de ayuda será vista por decenas de personas — úsala con responsabilidad.",
      confirmPayment: "¿Puedes recibir transferencias internacionales? Los participantes pueden ser de diferentes países. Asegúrate de tener una billetera cripto, PayPal, Wise, Revolut u otra forma de recibir fondos del extranjero.",
      confirmCheckbox: "Lo he pensado bien y confirmo",
      confirmButton: "Confirmar",
      cancelButton: "Cancelar"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "Este es tu ID de enlace personal para URLs de invitación. NO es una invitación en sí — no lo envíes a nadie. Usa los enlaces de arriba para invitar a alguien." },
    requiredInfo: {
      contactsTitle: "Agrega tus contactos",
      contactsText: "Se necesitan al menos 2 contactos para coordinar la ayuda",
      budgetTitle: "Presupuesto mensual de apoyo",
      budgetText: "Esta cantidad es tu intención, no un compromiso. No se vincula ninguna tarjeta ni se cobra dinero. Simplemente indicas cuánto estás dispuesto a ayudar al mes.",
      next: "Siguiente",
      save: "Guardar y continuar",
      contactsFilled: "Completados: {{count}}/2"
    }
  },
  fi: {
    onboarding: {
      step5: {
        title: "Miten sinuun saa yhteyden",
        text: "Lisää vähintään 2 yhteystapaa, jotta osallistujat voivat koordinoida kanssasi avun tarjoamisessa."
      },
      contactsRequired: "Lisää vähintään 2 yhteystietoa",
      contactsFilled: "Täytetty: {{count}}/2"
    },
    dashboard: { communityChat: "Yhteisön keskustelu" },
    create: {
      confirmTitle: "Vahvista keräyksen luominen",
      confirmText: "Varmista, että todella tarvitset tämän summan. Apusignaali näkyy kymmenille ihmisille — käytä sitä vastuullisesti.",
      confirmPayment: "Voitko vastaanottaa kansainvälisiä siirtoja? Osallistujat voivat olla eri maista. Varmista, että sinulla on kryptolompakko, PayPal, Wise, Revolut tai muu tapa vastaanottaa varoja ulkomailta.",
      confirmCheckbox: "Olen harkinnut asiaa ja vahvistan",
      confirmButton: "Vahvista",
      cancelButton: "Peruuta"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "Tämä on henkilökohtainen linkkitunnuksesi kutsu-URL-osoitteisiin. Se EI ole kutsu itsessään — älä lähetä sitä ihmisille. Käytä yllä olevia linkkejä kutsuaksesi jonkun." },
    requiredInfo: {
      contactsTitle: "Lisää yhteystietosi",
      contactsText: "Avun koordinointiin tarvitaan vähintään 2 yhteystapaa",
      budgetTitle: "Kuukausittainen tukibudjetti",
      budgetText: "Tämä summa on aikomuksesi, ei sitoumus. Korttia ei liitetä eikä rahaa veloiteta. Ilmoitat vain, kuinka paljon olet valmis auttamaan kuukaudessa.",
      next: "Seuraava",
      save: "Tallenna ja jatka",
      contactsFilled: "Täytetty: {{count}}/2"
    }
  },
  fr: {
    onboarding: {
      step5: {
        title: "Comment vous joindre",
        text: "Ajoutez au moins 2 moyens de contact afin que les participants puissent se coordonner avec vous pour apporter de l'aide."
      },
      contactsRequired: "Ajoutez au moins 2 contacts",
      contactsFilled: "Remplis : {{count}}/2"
    },
    dashboard: { communityChat: "Chat communautaire" },
    create: {
      confirmTitle: "Confirmer la création de la collecte",
      confirmText: "Assurez-vous que vous avez vraiment besoin de ce montant. Le signal d'aide sera vu par des dizaines de personnes — utilisez-le de manière responsable.",
      confirmPayment: "Pouvez-vous recevoir des virements internationaux ? Les participants peuvent venir de différents pays. Assurez-vous d'avoir un portefeuille crypto, PayPal, Wise, Revolut ou un autre moyen de recevoir des fonds de l'étranger.",
      confirmCheckbox: "J'ai bien réfléchi et je confirme",
      confirmButton: "Confirmer",
      cancelButton: "Annuler"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "Ceci est votre identifiant de lien personnel pour les URL d'invitation. Ce N'EST PAS une invitation en soi — ne l'envoyez pas aux gens. Utilisez les liens ci-dessus pour inviter quelqu'un." },
    requiredInfo: {
      contactsTitle: "Ajoutez vos contacts",
      contactsText: "Au moins 2 moyens de contact sont nécessaires pour coordonner l'aide",
      budgetTitle: "Budget mensuel de soutien",
      budgetText: "Ce montant est votre intention, pas un engagement. Aucune carte n'est liée, aucun argent n'est débité. Vous indiquez simplement combien vous êtes prêt à aider par mois.",
      next: "Suivant",
      save: "Enregistrer et continuer",
      contactsFilled: "Remplis : {{count}}/2"
    }
  },
  he: {
    onboarding: {
      step5: {
        title: "איך ליצור איתך קשר",
        text: "הוסף לפחות 2 דרכי יצירת קשר כדי שהמשתתפים יוכלו לתאם איתך בעת מתן סיוע."
      },
      contactsRequired: "הוסף לפחות 2 אנשי קשר",
      contactsFilled: "מלא: {{count}}/2"
    },
    dashboard: { communityChat: "צ'אט קהילתי" },
    create: {
      confirmTitle: "אישור יצירת גיוס",
      confirmText: "ודא שאתה באמת צריך סכום זה. אות העזרה ייראה על ידי עשרות אנשים — השתמש בו באחריות.",
      confirmPayment: "האם אתה יכול לקבל העברות בינלאומיות? משתתפים עשויים להיות ממדינות שונות. ודא שיש לך ארנק קריפטו, PayPal, Wise, Revolut או דרך אחרת לקבל כספים מחו\"ל.",
      confirmCheckbox: "חשבתי על כך ומאשר",
      confirmButton: "אישור",
      cancelButton: "ביטול"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "זהו מזהה הקישור האישי שלך לכתובות URL של הזמנות. זו לא הזמנה בפני עצמה — אל תשלח אותו לאנשים. השתמש בקישורים למעלה כדי להזמין מישהו." },
    requiredInfo: {
      contactsTitle: "הוסף את אנשי הקשר שלך",
      contactsText: "נדרשות לפחות 2 דרכי יצירת קשר לתיאום עזרה",
      budgetTitle: "תקציב תמיכה חודשי",
      budgetText: "סכום זה הוא כוונתך, לא התחייבות. לא מקושר כרטיס ולא נגבים כספים. אתה פשוט מציין כמה אתה מוכן לעזור בחודש.",
      next: "הבא",
      save: "שמור והמשך",
      contactsFilled: "מלא: {{count}}/2"
    }
  },
  hi: {
    onboarding: {
      step5: {
        title: "आपसे कैसे संपर्क करें",
        text: "कम से कम 2 संपर्क विधियाँ जोड़ें ताकि प्रतिभागी सहायता प्रदान करते समय आपके साथ समन्वय कर सकें।"
      },
      contactsRequired: "कम से कम 2 संपर्क जोड़ें",
      contactsFilled: "भरा गया: {{count}}/2"
    },
    dashboard: { communityChat: "सामुदायिक चैट" },
    create: {
      confirmTitle: "संग्रह निर्माण की पुष्टि करें",
      confirmText: "सुनिश्चित करें कि आपको वास्तव में इस राशि की आवश्यकता है। सहायता संकेत दर्जनों लोगों द्वारा देखा जाएगा — इसे जिम्मेदारी से उपयोग करें।",
      confirmPayment: "क्या आप अंतर्राष्ट्रीय हस्तांतरण प्राप्त कर सकते हैं? प्रतिभागी विभिन्न देशों से हो सकते हैं। सुनिश्चित करें कि आपके पास क्रिप्टो वॉलेट, PayPal, Wise, Revolut या विदेश से धन प्राप्त करने का कोई अन्य तरीका है।",
      confirmCheckbox: "मैंने सोच लिया है और पुष्टि करता/करती हूँ",
      confirmButton: "पुष्टि करें",
      cancelButton: "रद्द करें"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "यह आमंत्रण URL के लिए आपकी व्यक्तिगत लिंक ID है। यह स्वयं कोई आमंत्रण नहीं है — इसे लोगों को न भेजें। किसी को आमंत्रित करने के लिए ऊपर दिए गए लिंक का उपयोग करें।" },
    requiredInfo: {
      contactsTitle: "अपने संपर्क जोड़ें",
      contactsText: "सहायता समन्वय के लिए कम से कम 2 संपर्क विधियों की आवश्यकता है",
      budgetTitle: "मासिक सहायता बजट",
      budgetText: "यह राशि आपका इरादा है, प्रतिबद्धता नहीं। कोई कार्ड लिंक नहीं होता, कोई पैसा नहीं कटता। आप बस बताते हैं कि प्रति माह कितनी मदद करने को तैयार हैं।",
      next: "अगला",
      save: "सहेजें और जारी रखें",
      contactsFilled: "भरा गया: {{count}}/2"
    }
  },
  id: {
    onboarding: {
      step5: {
        title: "Cara menghubungi Anda",
        text: "Tambahkan minimal 2 metode kontak agar peserta dapat berkoordinasi dengan Anda saat memberikan bantuan."
      },
      contactsRequired: "Tambahkan minimal 2 kontak",
      contactsFilled: "Terisi: {{count}}/2"
    },
    dashboard: { communityChat: "Chat Komunitas" },
    create: {
      confirmTitle: "Konfirmasi pembuatan penggalangan",
      confirmText: "Pastikan Anda benar-benar membutuhkan jumlah ini. Sinyal bantuan akan dilihat oleh puluhan orang — gunakan dengan bertanggung jawab.",
      confirmPayment: "Bisakah Anda menerima transfer internasional? Peserta mungkin berasal dari negara yang berbeda. Pastikan Anda memiliki dompet kripto, PayPal, Wise, Revolut, atau cara lain untuk menerima dana dari luar negeri.",
      confirmCheckbox: "Saya sudah memikirkannya dan mengonfirmasi",
      confirmButton: "Konfirmasi",
      cancelButton: "Batal"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "Ini adalah ID tautan pribadi Anda untuk URL undangan. Ini BUKAN undangan itu sendiri — jangan kirimkan ke orang lain. Gunakan tautan di atas untuk mengundang seseorang." },
    requiredInfo: {
      contactsTitle: "Tambahkan kontak Anda",
      contactsText: "Minimal 2 kontak diperlukan untuk koordinasi bantuan",
      budgetTitle: "Anggaran dukungan bulanan",
      budgetText: "Jumlah ini adalah niat Anda, bukan komitmen. Tidak ada kartu yang ditautkan, tidak ada uang yang diambil. Anda hanya menunjukkan berapa banyak Anda bersedia membantu per bulan.",
      next: "Berikutnya",
      save: "Simpan dan lanjutkan",
      contactsFilled: "Terisi: {{count}}/2"
    }
  },
  it: {
    onboarding: {
      step5: {
        title: "Come contattarti",
        text: "Aggiungi almeno 2 metodi di contatto affinché i partecipanti possano coordinarsi con te quando forniscono aiuto."
      },
      contactsRequired: "Aggiungi almeno 2 contatti",
      contactsFilled: "Compilati: {{count}}/2"
    },
    dashboard: { communityChat: "Chat della comunità" },
    create: {
      confirmTitle: "Conferma creazione raccolta",
      confirmText: "Assicurati di aver davvero bisogno di questa somma. Il segnale di aiuto sarà visto da decine di persone — usalo con responsabilità.",
      confirmPayment: "Puoi ricevere trasferimenti internazionali? I partecipanti possono provenire da paesi diversi. Assicurati di avere un portafoglio crypto, PayPal, Wise, Revolut o un altro modo per ricevere fondi dall'estero.",
      confirmCheckbox: "Ci ho pensato bene e confermo",
      confirmButton: "Conferma",
      cancelButton: "Annulla"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "Questo è il tuo ID link personale per gli URL di invito. NON è un invito di per sé — non inviarlo alle persone. Usa i link sopra per invitare qualcuno." },
    requiredInfo: {
      contactsTitle: "Aggiungi i tuoi contatti",
      contactsText: "Sono necessari almeno 2 contatti per coordinare l'aiuto",
      budgetTitle: "Budget mensile di supporto",
      budgetText: "Questa somma è la tua intenzione, non un impegno. Nessuna carta viene collegata, nessun denaro viene addebitato. Indichi semplicemente quanto sei disposto ad aiutare al mese.",
      next: "Avanti",
      save: "Salva e continua",
      contactsFilled: "Compilati: {{count}}/2"
    }
  },
  ja: {
    onboarding: {
      step5: {
        title: "連絡方法",
        text: "参加者が支援の際にあなたと連携できるよう、少なくとも2つの連絡方法を追加してください。"
      },
      contactsRequired: "2つ以上の連絡先を追加してください",
      contactsFilled: "入力済み: {{count}}/2"
    },
    dashboard: { communityChat: "コミュニティチャット" },
    create: {
      confirmTitle: "募集の作成を確認",
      confirmText: "本当にこの金額が必要か確認してください。援助シグナルは数十人に表示されます — 責任を持って使用してください。",
      confirmPayment: "海外送金を受け取ることはできますか？参加者はさまざまな国から来る可能性があります。暗号通貨ウォレット、PayPal、Wise、Revolut、または海外からの送金を受け取る他の方法があることを確認してください。",
      confirmCheckbox: "よく考えた上で確認します",
      confirmButton: "確認",
      cancelButton: "キャンセル"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "これは招待URLに使用するあなたの個人リンクIDです。これ自体は招待ではありません — 人に送らないでください。誰かを招待するには上のリンクを使用してください。" },
    requiredInfo: {
      contactsTitle: "連絡先を追加",
      contactsText: "援助の調整には少なくとも2つの連絡方法が必要です",
      budgetTitle: "月間サポート予算",
      budgetText: "この金額はあなたの意思であり、義務ではありません。カードは紐付けられず、お金は引き落とされません。月にどれくらい助ける用意があるかを示すだけです。",
      next: "次へ",
      save: "保存して続行",
      contactsFilled: "入力済み: {{count}}/2"
    }
  },
  ko: {
    onboarding: {
      step5: {
        title: "연락 방법",
        text: "참가자들이 도움을 제공할 때 당신과 조율할 수 있도록 최소 2개의 연락 방법을 추가하세요."
      },
      contactsRequired: "최소 2개의 연락처를 추가하세요",
      contactsFilled: "입력됨: {{count}}/2"
    },
    dashboard: { communityChat: "커뮤니티 채팅" },
    create: {
      confirmTitle: "모금 생성 확인",
      confirmText: "이 금액이 정말 필요한지 확인하세요. 도움 신호는 수십 명에게 보여집니다 — 책임감 있게 사용하세요.",
      confirmPayment: "국제 송금을 받을 수 있나요? 참가자들은 다른 나라에서 올 수 있습니다. 암호화폐 지갑, PayPal, Wise, Revolut 또는 해외에서 자금을 받을 수 있는 다른 방법이 있는지 확인하세요.",
      confirmCheckbox: "충분히 생각했으며 확인합니다",
      confirmButton: "확인",
      cancelButton: "취소"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "이것은 초대 URL에 사용되는 개인 링크 ID입니다. 이것 자체가 초대가 아닙니다 — 사람들에게 보내지 마세요. 누군가를 초대하려면 위의 링크를 사용하세요." },
    requiredInfo: {
      contactsTitle: "연락처 추가",
      contactsText: "도움 조율을 위해 최소 2개의 연락 방법이 필요합니다",
      budgetTitle: "월간 지원 예산",
      budgetText: "이 금액은 당신의 의향이며 약속이 아닙니다. 카드가 연결되지 않으며 돈이 청구되지 않습니다. 매달 얼마나 도울 의향이 있는지 표시하는 것입니다.",
      next: "다음",
      save: "저장하고 계속",
      contactsFilled: "입력됨: {{count}}/2"
    }
  },
  nl: {
    onboarding: {
      step5: {
        title: "Hoe u te bereiken",
        text: "Voeg minimaal 2 contactmethoden toe zodat deelnemers met u kunnen coördineren bij het verlenen van hulp."
      },
      contactsRequired: "Voeg minimaal 2 contacten toe",
      contactsFilled: "Ingevuld: {{count}}/2"
    },
    dashboard: { communityChat: "Community-chat" },
    create: {
      confirmTitle: "Bevestig het aanmaken van de inzameling",
      confirmText: "Zorg ervoor dat u dit bedrag echt nodig heeft. Het hulpsignaal wordt door tientallen mensen gezien — gebruik het verantwoord.",
      confirmPayment: "Kunt u internationale overboekingen ontvangen? Deelnemers kunnen uit verschillende landen komen. Zorg ervoor dat u een crypto-wallet, PayPal, Wise, Revolut of een andere manier heeft om geld uit het buitenland te ontvangen.",
      confirmCheckbox: "Ik heb erover nagedacht en bevestig",
      confirmButton: "Bevestigen",
      cancelButton: "Annuleren"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "Dit is uw persoonlijke link-ID voor uitnodigings-URL's. Het is GEEN uitnodiging op zich — stuur het niet naar mensen. Gebruik de bovenstaande links om iemand uit te nodigen." },
    requiredInfo: {
      contactsTitle: "Voeg uw contacten toe",
      contactsText: "Er zijn minimaal 2 contactmethoden nodig voor hulpcoördinatie",
      budgetTitle: "Maandelijks ondersteuningsbudget",
      budgetText: "Dit bedrag is uw intentie, geen verplichting. Er wordt geen kaart gekoppeld en er wordt geen geld afgeschreven. U geeft simpelweg aan hoeveel u bereid bent per maand te helpen.",
      next: "Volgende",
      save: "Opslaan en doorgaan",
      contactsFilled: "Ingevuld: {{count}}/2"
    }
  },
  no: {
    onboarding: {
      step5: {
        title: "Hvordan kontakte deg",
        text: "Legg til minst 2 kontaktmetoder slik at deltakerne kan koordinere med deg når de gir hjelp."
      },
      contactsRequired: "Legg til minst 2 kontakter",
      contactsFilled: "Fylt ut: {{count}}/2"
    },
    dashboard: { communityChat: "Fellesskapschat" },
    create: {
      confirmTitle: "Bekreft opprettelse av innsamling",
      confirmText: "Sørg for at du virkelig trenger dette beløpet. Hjelpesignalet vil bli sett av titalls mennesker — bruk det ansvarlig.",
      confirmPayment: "Kan du motta internasjonale overføringer? Deltakere kan komme fra forskjellige land. Sørg for at du har en kryptolommebok, PayPal, Wise, Revolut eller en annen måte å motta penger fra utlandet.",
      confirmCheckbox: "Jeg har tenkt det gjennom og bekrefter",
      confirmButton: "Bekreft",
      cancelButton: "Avbryt"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "Dette er din personlige lenke-ID for invitasjons-URLer. Det er IKKE en invitasjon i seg selv — ikke send det til folk. Bruk lenkene ovenfor for å invitere noen." },
    requiredInfo: {
      contactsTitle: "Legg til kontaktene dine",
      contactsText: "Minst 2 kontaktmetoder er nødvendige for hjelpekoordinering",
      budgetTitle: "Månedlig støttebudsjett",
      budgetText: "Dette beløpet er din intensjon, ikke en forpliktelse. Ingen kort er knyttet, ingen penger trekkes. Du angir bare hvor mye du er villig til å hjelpe per måned.",
      next: "Neste",
      save: "Lagre og fortsett",
      contactsFilled: "Fylt ut: {{count}}/2"
    }
  },
  pl: {
    onboarding: {
      step5: {
        title: "Jak się z tobą skontaktować",
        text: "Dodaj co najmniej 2 sposoby kontaktu, aby uczestnicy mogli się z tobą koordynować przy udzielaniu pomocy."
      },
      contactsRequired: "Dodaj co najmniej 2 kontakty",
      contactsFilled: "Wypełniono: {{count}}/2"
    },
    dashboard: { communityChat: "Czat społeczności" },
    create: {
      confirmTitle: "Potwierdź utworzenie zbiórki",
      confirmText: "Upewnij się, że naprawdę potrzebujesz tej kwoty. Sygnał o pomoc zobaczy dziesiątki osób — używaj go odpowiedzialnie.",
      confirmPayment: "Czy możesz otrzymywać przelewy międzynarodowe? Uczestnicy mogą być z różnych krajów. Upewnij się, że masz portfel krypto, PayPal, Wise, Revolut lub inny sposób na otrzymanie środków z zagranicy.",
      confirmCheckbox: "Przemyślałem/am to i potwierdzam",
      confirmButton: "Potwierdź",
      cancelButton: "Anuluj"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "To jest twój osobisty identyfikator linku do URL-i zaproszeń. To NIE jest samo zaproszenie — nie wysyłaj go ludziom. Użyj powyższych linków, aby kogoś zaprosić." },
    requiredInfo: {
      contactsTitle: "Dodaj swoje kontakty",
      contactsText: "Do koordynacji pomocy potrzeba co najmniej 2 sposobów kontaktu",
      budgetTitle: "Miesięczny budżet wsparcia",
      budgetText: "Ta kwota to twoja intencja, nie zobowiązanie. Żadna karta nie jest podpięta, żadne pieniądze nie są pobierane. Po prostu wskazujesz, ile jesteś gotów pomóc miesięcznie.",
      next: "Dalej",
      save: "Zapisz i kontynuuj",
      contactsFilled: "Wypełniono: {{count}}/2"
    }
  },
  pt: {
    onboarding: {
      step5: {
        title: "Como entrar em contacto",
        text: "Adicione pelo menos 2 métodos de contacto para que os participantes possam coordenar consigo ao prestar ajuda."
      },
      contactsRequired: "Adicione pelo menos 2 contactos",
      contactsFilled: "Preenchidos: {{count}}/2"
    },
    dashboard: { communityChat: "Chat da comunidade" },
    create: {
      confirmTitle: "Confirmar criação da coleta",
      confirmText: "Certifique-se de que realmente precisa deste valor. O sinal de ajuda será visto por dezenas de pessoas — use-o com responsabilidade.",
      confirmPayment: "Pode receber transferências internacionais? Os participantes podem ser de diferentes países. Certifique-se de que tem uma carteira crypto, PayPal, Wise, Revolut ou outra forma de receber fundos do exterior.",
      confirmCheckbox: "Pensei bem e confirmo",
      confirmButton: "Confirmar",
      cancelButton: "Cancelar"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "Este é o seu ID de link pessoal para URLs de convite. NÃO é um convite em si — não o envie a pessoas. Use os links acima para convidar alguém." },
    requiredInfo: {
      contactsTitle: "Adicione os seus contactos",
      contactsText: "São necessários pelo menos 2 contactos para coordenação de ajuda",
      budgetTitle: "Orçamento mensal de apoio",
      budgetText: "Este valor é a sua intenção, não um compromisso. Nenhum cartão é vinculado, nenhum dinheiro é cobrado. Simplesmente indica quanto está disposto a ajudar por mês.",
      next: "Seguinte",
      save: "Guardar e continuar",
      contactsFilled: "Preenchidos: {{count}}/2"
    }
  },
  ro: {
    onboarding: {
      step5: {
        title: "Cum să te contactăm",
        text: "Adaugă cel puțin 2 metode de contact pentru ca participanții să se poată coordona cu tine atunci când oferă ajutor."
      },
      contactsRequired: "Adaugă cel puțin 2 contacte",
      contactsFilled: "Completate: {{count}}/2"
    },
    dashboard: { communityChat: "Chat comunitate" },
    create: {
      confirmTitle: "Confirmă crearea colectei",
      confirmText: "Asigură-te că ai cu adevărat nevoie de această sumă. Semnalul de ajutor va fi văzut de zeci de persoane — folosește-l responsabil.",
      confirmPayment: "Poți primi transferuri internaționale? Participanții pot fi din diferite țări. Asigură-te că ai un portofel crypto, PayPal, Wise, Revolut sau alt mod de a primi fonduri din străinătate.",
      confirmCheckbox: "M-am gândit bine și confirm",
      confirmButton: "Confirmă",
      cancelButton: "Anulează"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "Acesta este ID-ul tău personal de link pentru URL-urile de invitație. NU este o invitație în sine — nu-l trimite oamenilor. Folosește linkurile de mai sus pentru a invita pe cineva." },
    requiredInfo: {
      contactsTitle: "Adaugă contactele tale",
      contactsText: "Sunt necesare cel puțin 2 metode de contact pentru coordonarea ajutorului",
      budgetTitle: "Buget lunar de sprijin",
      budgetText: "Această sumă este intenția ta, nu un angajament. Nu se leagă niciun card, nu se reține nicio sumă. Pur și simplu indici cât ești dispus să ajuți pe lună.",
      next: "Următorul",
      save: "Salvează și continuă",
      contactsFilled: "Completate: {{count}}/2"
    }
  },
  sr: {
    onboarding: {
      step5: {
        title: "Како да вас контактирамо",
        text: "Додајте најмање 2 начина контакта како би учесници могли да се координишу са вама приликом пружања помоћи."
      },
      contactsRequired: "Додајте најмање 2 контакта",
      contactsFilled: "Попуњено: {{count}}/2"
    },
    dashboard: { communityChat: "Чат заједнице" },
    create: {
      confirmTitle: "Потврдите креирање прикупљања",
      confirmText: "Уверите се да вам заиста треба овај износ. Сигнал за помоћ ће видети десетине људи — користите га одговорно.",
      confirmPayment: "Можете ли примити међународне трансфере? Учесници могу бити из различитих земаља. Уверите се да имате крипто новчаник, PayPal, Wise, Revolut или други начин за пријем средстава из иностранства.",
      confirmCheckbox: "Размислио/ла сам и потврђујем",
      confirmButton: "Потврди",
      cancelButton: "Откажи"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "Ово је ваш лични ИД линка за URL-ове позивница. То НИЈЕ позивница сама по себи — не шаљите је људима. Користите горње линкове да позовете некога." },
    requiredInfo: {
      contactsTitle: "Додајте своје контакте",
      contactsText: "Потребна су најмање 2 начина контакта за координацију помоћи",
      budgetTitle: "Месечни буџет подршке",
      budgetText: "Овај износ је ваша намера, а не обавеза. Ниједна картица није повезана, новац се не наплаћује. Једноставно наводите колико сте спремни да помогнете месечно.",
      next: "Следеће",
      save: "Сачувај и настави",
      contactsFilled: "Попуњено: {{count}}/2"
    }
  },
  sv: {
    onboarding: {
      step5: {
        title: "Hur man kontaktar dig",
        text: "Lägg till minst 2 kontaktmetoder så att deltagarna kan samordna med dig när de ger hjälp."
      },
      contactsRequired: "Lägg till minst 2 kontakter",
      contactsFilled: "Ifyllt: {{count}}/2"
    },
    dashboard: { communityChat: "Gemenskapschat" },
    create: {
      confirmTitle: "Bekräfta skapande av insamling",
      confirmText: "Se till att du verkligen behöver detta belopp. Hjälpsignalen kommer att ses av tiotal personer — använd den ansvarsfullt.",
      confirmPayment: "Kan du ta emot internationella överföringar? Deltagare kan vara från olika länder. Se till att du har en kryptoplånbok, PayPal, Wise, Revolut eller ett annat sätt att ta emot pengar från utlandet.",
      confirmCheckbox: "Jag har tänkt igenom det och bekräftar",
      confirmButton: "Bekräfta",
      cancelButton: "Avbryt"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "Detta är ditt personliga länk-ID för inbjudnings-URL:er. Det är INTE en inbjudan i sig — skicka det inte till folk. Använd länkarna ovan för att bjuda in någon." },
    requiredInfo: {
      contactsTitle: "Lägg till dina kontakter",
      contactsText: "Minst 2 kontaktmetoder behövs för hjälpkoordinering",
      budgetTitle: "Månatlig stödbudget",
      budgetText: "Detta belopp är din avsikt, inte ett åtagande. Inget kort kopplas och inga pengar dras. Du anger helt enkelt hur mycket du är villig att hjälpa per månad.",
      next: "Nästa",
      save: "Spara och fortsätt",
      contactsFilled: "Ifyllt: {{count}}/2"
    }
  },
  th: {
    onboarding: {
      step5: {
        title: "วิธีการติดต่อคุณ",
        text: "เพิ่มช่องทางติดต่ออย่างน้อย 2 ช่องทาง เพื่อให้ผู้เข้าร่วมสามารถประสานงานกับคุณเมื่อให้ความช่วยเหลือ"
      },
      contactsRequired: "เพิ่มช่องทางติดต่ออย่างน้อย 2 ช่องทาง",
      contactsFilled: "กรอกแล้ว: {{count}}/2"
    },
    dashboard: { communityChat: "แชทชุมชน" },
    create: {
      confirmTitle: "ยืนยันการสร้างการระดมทุน",
      confirmText: "ตรวจสอบให้แน่ใจว่าคุณต้องการจำนวนเงินนี้จริงๆ สัญญาณขอความช่วยเหลือจะถูกเห็นโดยผู้คนหลายสิบคน — ใช้อย่างรับผิดชอบ",
      confirmPayment: "คุณสามารถรับการโอนเงินระหว่างประเทศได้หรือไม่? ผู้เข้าร่วมอาจมาจากประเทศต่างๆ ตรวจสอบให้แน่ใจว่าคุณมีกระเป๋าเงินคริปโต, PayPal, Wise, Revolut หรือวิธีอื่นในการรับเงินจากต่างประเทศ",
      confirmCheckbox: "ฉันคิดไตร่ตรองแล้วและยืนยัน",
      confirmButton: "ยืนยัน",
      cancelButton: "ยกเลิก"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "นี่คือ ID ลิงก์ส่วนตัวของคุณสำหรับ URL เชิญ นี่ไม่ใช่คำเชิญ — อย่าส่งให้คนอื่น ใช้ลิงก์ด้านบนเพื่อเชิญใครสักคน" },
    requiredInfo: {
      contactsTitle: "เพิ่มช่องทางติดต่อของคุณ",
      contactsText: "ต้องมีช่องทางติดต่ออย่างน้อย 2 ช่องทางสำหรับการประสานงานช่วยเหลือ",
      budgetTitle: "งบประมาณสนับสนุนรายเดือน",
      budgetText: "จำนวนเงินนี้คือเจตนาของคุณ ไม่ใช่พันธะ ไม่มีการเชื่อมต่อบัตร ไม่มีการหักเงิน คุณเพียงแค่ระบุว่าคุณยินดีช่วยเหลือต่อเดือนเท่าไหร่",
      next: "ถัดไป",
      save: "บันทึกและดำเนินการต่อ",
      contactsFilled: "กรอกแล้ว: {{count}}/2"
    }
  },
  tr: {
    onboarding: {
      step5: {
        title: "Size nasıl ulaşılır",
        text: "Katılımcıların yardım sağlarken sizinle koordine olabilmesi için en az 2 iletişim yöntemi ekleyin."
      },
      contactsRequired: "En az 2 iletişim bilgisi ekleyin",
      contactsFilled: "Doldurulmuş: {{count}}/2"
    },
    dashboard: { communityChat: "Topluluk sohbeti" },
    create: {
      confirmTitle: "Toplama oluşturmayı onayla",
      confirmText: "Bu tutara gerçekten ihtiyacınız olduğundan emin olun. Yardım sinyali onlarca kişi tarafından görülecektir — sorumlu bir şekilde kullanın.",
      confirmPayment: "Uluslararası transferler alabilir misiniz? Katılımcılar farklı ülkelerden olabilir. Kripto cüzdanınız, PayPal, Wise, Revolut veya yurt dışından para almanın başka bir yolunuz olduğundan emin olun.",
      confirmCheckbox: "Düşündüm ve onaylıyorum",
      confirmButton: "Onayla",
      cancelButton: "İptal"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "Bu, davet URL'leri için kişisel bağlantı kimliğinizdir. Bu bir davet DEĞİLDİR — insanlara göndermeyin. Birini davet etmek için yukarıdaki bağlantıları kullanın." },
    requiredInfo: {
      contactsTitle: "İletişim bilgilerinizi ekleyin",
      contactsText: "Yardım koordinasyonu için en az 2 iletişim yöntemi gereklidir",
      budgetTitle: "Aylık destek bütçesi",
      budgetText: "Bu tutar niyetinizdir, taahhüt değil. Kart bağlanmaz, para çekilmez. Ayda ne kadar yardım etmeye hazır olduğunuzu belirtirsiniz.",
      next: "İleri",
      save: "Kaydet ve devam et",
      contactsFilled: "Doldurulmuş: {{count}}/2"
    }
  },
  uk: {
    onboarding: {
      step5: {
        title: "Як з вами зв'язатися",
        text: "Додайте щонайменше 2 способи зв'язку, щоб учасники могли координуватися з вами при наданні допомоги."
      },
      contactsRequired: "Додайте щонайменше 2 контакти",
      contactsFilled: "Заповнено: {{count}}/2"
    },
    dashboard: { communityChat: "Чат спільноти" },
    create: {
      confirmTitle: "Підтвердити створення збору",
      confirmText: "Переконайтеся, що вам дійсно потрібна ця сума. Сигнал про допомогу побачать десятки людей — використовуйте його відповідально.",
      confirmPayment: "Чи можете ви отримати міжнародні перекази? Учасники можуть бути з різних країн. Переконайтеся, що у вас є криптогаманець, PayPal, Wise, Revolut або інший спосіб отримати кошти з-за кордону.",
      confirmCheckbox: "Я подумав/ла і підтверджую",
      confirmButton: "Підтвердити",
      cancelButton: "Скасувати"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "Це ваш персональний ID посилання для URL запрошень. Це НЕ запрошення саме по собі — не надсилайте його людям. Використовуйте посилання вище, щоб запросити когось." },
    requiredInfo: {
      contactsTitle: "Додайте свої контакти",
      contactsText: "Для координації допомоги потрібні щонайменше 2 способи зв'язку",
      budgetTitle: "Місячний бюджет підтримки",
      budgetText: "Ця сума — ваш намір, а не зобов'язання. Жодна картка не прив'язується, гроші не списуються. Ви просто вказуєте, скільки готові допомогти на місяць.",
      next: "Далі",
      save: "Зберегти і продовжити",
      contactsFilled: "Заповнено: {{count}}/2"
    }
  },
  vi: {
    onboarding: {
      step5: {
        title: "Cách liên hệ với bạn",
        text: "Thêm ít nhất 2 phương thức liên hệ để người tham gia có thể phối hợp với bạn khi hỗ trợ."
      },
      contactsRequired: "Thêm ít nhất 2 liên hệ",
      contactsFilled: "Đã điền: {{count}}/2"
    },
    dashboard: { communityChat: "Chat cộng đồng" },
    create: {
      confirmTitle: "Xác nhận tạo quyên góp",
      confirmText: "Hãy chắc chắn rằng bạn thực sự cần số tiền này. Tín hiệu trợ giúp sẽ được hàng chục người nhìn thấy — hãy sử dụng nó có trách nhiệm.",
      confirmPayment: "Bạn có thể nhận chuyển khoản quốc tế không? Người tham gia có thể đến từ các quốc gia khác nhau. Hãy đảm bảo bạn có ví tiền điện tử, PayPal, Wise, Revolut hoặc cách khác để nhận tiền từ nước ngoài.",
      confirmCheckbox: "Tôi đã suy nghĩ kỹ và xác nhận",
      confirmButton: "Xác nhận",
      cancelButton: "Hủy"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "Đây là ID liên kết cá nhân của bạn cho URL lời mời. Đây KHÔNG phải là lời mời — đừng gửi nó cho người khác. Sử dụng các liên kết ở trên để mời ai đó." },
    requiredInfo: {
      contactsTitle: "Thêm liên hệ của bạn",
      contactsText: "Cần ít nhất 2 phương thức liên hệ để phối hợp hỗ trợ",
      budgetTitle: "Ngân sách hỗ trợ hàng tháng",
      budgetText: "Số tiền này là ý định của bạn, không phải cam kết. Không có thẻ nào được liên kết, không có tiền nào bị trừ. Bạn chỉ đơn giản cho biết bạn sẵn sàng giúp bao nhiêu mỗi tháng.",
      next: "Tiếp theo",
      save: "Lưu và tiếp tục",
      contactsFilled: "Đã điền: {{count}}/2"
    }
  },
  zh: {
    onboarding: {
      step5: {
        title: "如何联系您",
        text: "添加至少2种联系方式，以便参与者在提供帮助时能与您协调。"
      },
      contactsRequired: "请添加至少2个联系方式",
      contactsFilled: "已填写: {{count}}/2"
    },
    dashboard: { communityChat: "社区聊天" },
    create: {
      confirmTitle: "确认创建募集",
      confirmText: "请确认您确实需要这笔金额。求助信号将被数十人看到——请负责任地使用。",
      confirmPayment: "您能接收国际转账吗？参与者可能来自不同国家。请确保您有加密钱包、PayPal、Wise、Revolut或其他接收海外资金的方式。",
      confirmCheckbox: "我已深思熟虑并确认",
      confirmButton: "确认",
      cancelButton: "取消"
    },
    contacts: { tiktok: "TikTok" },
    invite: { slugDesc: "这是您的邀请链接个人ID。这本身不是邀请——不要发送给别人。请使用上方的链接来邀请某人。" },
    requiredInfo: {
      contactsTitle: "添加您的联系方式",
      contactsText: "帮助协调需要至少2种联系方式",
      budgetTitle: "每月支持预算",
      budgetText: "这个金额是您的意向，而非承诺。不会绑定任何银行卡，不会扣款。您只是表明每月愿意帮助多少。",
      next: "下一步",
      save: "保存并继续",
      contactsFilled: "已填写: {{count}}/2"
    }
  }
};

// Deep merge: only adds keys that don't exist
function deepMerge(target, source) {
  for (const [key, val] of Object.entries(source)) {
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      deepMerge(target[key], val);
    } else {
      target[key] = val; // overwrite for step5, add for new keys
    }
  }
  return target;
}

let totalUpdated = 0;

for (const [lang, trans] of Object.entries(translations)) {
  const filePath = path.join(LOCALES_DIR, `${lang}.json`);
  if (!fs.existsSync(filePath)) {
    console.log(`${lang}: file not found, skipping`);
    continue;
  }

  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Step 1: Move old step5 (budget) to step6 if step6 doesn't exist
  if (json.onboarding?.step5 && !json.onboarding?.step6) {
    json.onboarding.step6 = { ...json.onboarding.step5 };
    console.log(`${lang}: moved old step5 (budget) → step6`);
  }

  // Step 2: Apply translations (overwrite step5 with contacts, add new keys)
  deepMerge(json, trans);

  fs.writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log(`${lang}: updated`);
  totalUpdated++;
}

console.log(`\nDone! Updated ${totalUpdated} locale files.`);
