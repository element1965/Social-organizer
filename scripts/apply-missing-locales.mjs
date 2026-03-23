import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, '..', 'packages', 'i18n', 'locales');

const translations = {
  cs: {
    entryWarningTitle: 'Moment',
    entryWarningText: 'Vytvoření žádosti o pomoc odešle oznámení desítkám lidí ve vaší síti. Pokud jen zkoumáte aplikaci — nevytvářejte skutečnou žádost. Tento nástroj je pro ty, kteří skutečně potřebují pomoc.',
    entryWarningProceed: 'Rozumím, pokračovat',
    entryWarningBack: 'Zpět',
    notEnoughConnectionsTitle: 'Nedostatek spojení',
    notEnoughConnectionsText: 'Pro vytvoření signálu o pomoci potřebujete alespoň {{min}} spojení ve vaší síti. Pozvěte více lidí pro odemknutí této funkce.',
    connectionsRemaining: 'Potřeba ještě {{count}}',
    goToNetwork: 'Pozvat lidi',
  },
  ro: {
    entryWarningTitle: 'Un moment',
    entryWarningText: 'Crearea unei cereri de ajutor va trimite o notificare la zeci de persoane din rețeaua ta. Dacă doar explorezi aplicația — nu crea o cerere reală. Acest instrument este pentru cei care au cu adevărat nevoie de ajutor.',
    entryWarningProceed: 'Înțeleg, continuă',
    entryWarningBack: 'Înapoi',
    notEnoughConnectionsTitle: 'Nu sunt suficiente conexiuni',
    notEnoughConnectionsText: 'Pentru a crea un semnal de ajutor, ai nevoie de cel puțin {{min}} conexiuni în rețeaua ta. Invită mai multe persoane pentru a debloca această funcție.',
    connectionsRemaining: 'Mai sunt necesare {{count}}',
    goToNetwork: 'Invită persoane',
  },
  sr: {
    entryWarningTitle: 'Сачекајте',
    entryWarningText: 'Креирање захтева за помоћ ће послати обавештење десетинама људи у вашој мрежи. Ако само истражујете апликацију — не креирајте стваран захтев. Овај алат је за оне којима је заиста потребна помоћ.',
    entryWarningProceed: 'Разумем, наставите',
    entryWarningBack: 'Назад',
    notEnoughConnectionsTitle: 'Недовољно веза',
    notEnoughConnectionsText: 'За креирање сигнала за помоћ потребно вам је најмање {{min}} веза у вашој мрежи. Позовите више људи да откључате ову функцију.',
    connectionsRemaining: 'Потребно је још {{count}}',
    goToNetwork: 'Позовите људе',
  },
  vi: {
    entryWarningTitle: 'Chờ một chút',
    entryWarningText: 'Tạo yêu cầu trợ giúp sẽ gửi thông báo đến hàng chục người trong mạng lưới của bạn. Nếu bạn chỉ đang khám phá ứng dụng — đừng tạo yêu cầu thật. Công cụ này dành cho những người thực sự cần giúp đỡ.',
    entryWarningProceed: 'Tôi hiểu, tiếp tục',
    entryWarningBack: 'Quay lại',
    notEnoughConnectionsTitle: 'Không đủ kết nối',
    notEnoughConnectionsText: 'Để tạo tín hiệu trợ giúp, bạn cần ít nhất {{min}} kết nối trong mạng lưới của mình. Mời thêm người để mở khóa tính năng này.',
    connectionsRemaining: 'Cần thêm {{count}}',
    goToNetwork: 'Mời mọi người',
  },
  zh: {
    entryWarningTitle: '请稍等',
    entryWarningText: '创建求助请求将向您网络中的数十人发送通知。如果您只是在探索应用 — 请不要创建真实请求。此工具专为真正需要帮助的人设计。',
    entryWarningProceed: '我理解，继续',
    entryWarningBack: '返回',
    notEnoughConnectionsTitle: '连接不足',
    notEnoughConnectionsText: '要创建求助信号，您的网络中至少需要 {{min}} 个连接。邀请更多人来解锁此功能。',
    connectionsRemaining: '还需要 {{count}} 个',
    goToNetwork: '邀请他人',
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
