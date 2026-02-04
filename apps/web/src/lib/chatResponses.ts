/**
 * Knowledge base for chat assistant
 * Responses are provided in Russian and English as base,
 * for other languages the system will use the English version
 */

interface KnowledgeItem {
  keywords: string[];
  response: {
    ru: string;
    en: string;
  };
}

const knowledge: KnowledgeItem[] = [
  {
    keywords: ['рукопожатие', 'handshake', 'связь', 'connection', 'друг', 'friend', 'контакт', 'contact'],
    response: {
      ru: 'Рукопожатие — это взаимное подтверждение существующей значимой связи между двумя людьми. Это как сказать "да, мы знаем друг друга лично и можем друг на друга положиться". Рукопожатие двустороннее и добровольное — оба человека должны его подтвердить. Лимит — 150 рукопожатий (число Данбара).',
      en: 'A handshake is a mutual confirmation of an existing meaningful connection between two people. It\'s like saying "yes, we know each other personally and can rely on each other". A handshake is two-sided and voluntary — both people must confirm it. The limit is 150 handshakes (Dunbar\'s number).'
    }
  },
  {
    keywords: ['намерение', 'intention', 'помощь', 'help', 'поддержка', 'support', 'помочь'],
    response: {
      ru: 'Намерение — это ваше добровольное решение помочь конкретному человеку. Это не обязательство и не долг! Вы просто говорите: "Я готов помочь этому человеку на такую-то сумму". Никакого давления — всё полностью добровольно. Намерение фиксируется и видно всем в сети.',
      en: 'An intention is your voluntary decision to help a specific person. It\'s not an obligation or debt! You\'re simply saying: "I\'m ready to help this person for this amount". No pressure — everything is completely voluntary. The intention is recorded and visible to everyone in the network.'
    }
  },
  {
    keywords: ['сбор', 'collection', 'собрать', 'fundraise', 'сигнал', 'signal', 'нужна помощь'],
    response: {
      ru: 'Когда вам нужна помощь, вы создаёте сигнал о поддержке. Это не попрошайничество — это нормальная часть взаимопомощи в сети доверия. Ваша сеть узнает о ситуации через цепочку рукопожатий. Есть два типа: экстренный (срочная помощь) и регулярный (28-дневный цикл).',
      en: 'When you need help, you create a support signal. It\'s not begging — it\'s a normal part of mutual support in a trust network. Your network learns about the situation through the handshake chain. There are two types: emergency (urgent help) and regular (28-day cycle).'
    }
  },
  {
    keywords: ['возможности', 'capabilities', 'бюджет', 'budget', 'месячный', 'monthly', 'текущие'],
    response: {
      ru: 'Текущие возможности сети — это сумма, которую все участники вашей сети готовы направить на взаимопомощь. Это не общий счёт, а показатель готовности помогать. Каждый указывает, сколько в месяц может выделить на поддержку. Когда вы помогаете — ваш вклад уменьшается.',
      en: 'Current network capabilities is the amount that all participants in your network are ready to direct to mutual support. It\'s not a shared account, but an indicator of willingness to help. Each person specifies how much they can allocate per month. When you help — your contribution decreases.'
    }
  },
  {
    keywords: ['данбар', 'dunbar', '150', 'ограничение', 'limit', 'лимит'],
    response: {
      ru: 'Число Данбара (около 150) — это количество людей, с которыми мы можем поддерживать настоящие отношения. Это особенность человеческого мозга! Поэтому в приложении ограничение на 150 прямых связей — это отражение реальности наших социальных возможностей.',
      en: 'Dunbar\'s number (about 150) is the number of people we can maintain real relationships with. It\'s a feature of the human brain! That\'s why the app limits 150 direct connections — it reflects the reality of our social capabilities.'
    }
  },
  {
    keywords: ['цепочка', 'chain', 'путь', 'path', 'степень', 'degree', 'уровень', 'level'],
    response: {
      ru: 'Цепочка рукопожатий показывает, как вы связаны с человеком через общих знакомых. Например: вы → ваш друг → его друг. Это 2 рукопожатия. Теория шести рукопожатий говорит, что любые два человека на Земле связаны не более чем 6 рукопожатиями!',
      en: 'The handshake chain shows how you\'re connected to someone through mutual acquaintances. For example: you → your friend → their friend. That\'s 2 handshakes. The six degrees of separation theory says any two people on Earth are connected by no more than 6 handshakes!'
    }
  },
  {
    keywords: ['реестр', 'registry', 'список', 'граф', 'graph', 'сеть', 'network'],
    response: {
      ru: 'Реестр — это список всех участников в виде графа связей. Каждый видит, кто чей подтверждённый друг. Реестр прозрачен для всех участников. Все связи строятся на уже существующих отношениях между реальными людьми.',
      en: 'The registry is a list of all participants as a graph of connections. Everyone sees who is whose confirmed friend. The registry is transparent to all participants. All connections are built on already existing relationships between real people.'
    }
  },
  {
    keywords: ['репутация', 'reputation', 'доверие', 'trust', 'надёжность'],
    response: {
      ru: 'Репутация — это не рейтинг. Это совокупность фактов ваших действий: выполненные намерения, участие во взаимопомощи. Всё это видно в вашем профиле и служит индикатором надёжности для других участников.',
      en: 'Reputation is not a rating. It\'s a collection of facts about your actions: fulfilled intentions, participation in mutual support. All of this is visible in your profile and serves as an indicator of reliability for others.'
    }
  },
  {
    keywords: ['игнор', 'ignore', 'блокировка', 'block', 'скрыть'],
    response: {
      ru: 'Игнор — это односторонний разрыв коммуникации. Он блокирует уведомления от человека, но не разрывает рукопожатие. Смысл: "Я на него не рассчитываю и он пусть на меня не рассчитывает". Игнор можно отменить в любой момент.',
      en: 'Ignore is a one-sided communication break. It blocks notifications from a person but doesn\'t break the handshake. Meaning: "I\'m not counting on them and they shouldn\'t count on me". Ignore can be reversed at any time.'
    }
  },
  {
    keywords: ['как', 'how', 'начать', 'start', 'использовать', 'use', 'работает', 'work'],
    response: {
      ru: 'Чтобы начать: 1) Добавьте рукопожатия с людьми, которых знаете лично. 2) Укажите месячный бюджет поддержки (необязательно). 3) Когда кому-то нужна помощь — вы получите уведомление. 4) Если нужна помощь вам — создайте сигнал. Всё просто!',
      en: 'To start: 1) Add handshakes with people you know personally. 2) Set your monthly support budget (optional). 3) When someone needs help — you\'ll get a notification. 4) If you need help — create a signal. It\'s that simple!'
    }
  },
  {
    keywords: ['экстренный', 'emergency', 'срочный', 'urgent', 'срочно'],
    response: {
      ru: 'Экстренный сбор — для срочных ситуаций, когда помощь нужна прямо сейчас. Уведомления рассылаются сразу всей сети. Сбор активен пока не закроется вручную или не достигнет цели.',
      en: 'Emergency collection is for urgent situations when help is needed right now. Notifications are sent immediately to the entire network. The collection is active until manually closed or reaches its goal.'
    }
  },
  {
    keywords: ['регулярный', 'regular', 'цикл', 'cycle', '28'],
    response: {
      ru: 'Регулярный сбор работает циклами по 28 дней. Это для ситуаций, когда помощь нужна, но не срочно. Каждые 28 дней цикл закрывается и может быть возобновлён. Подходит для планируемых расходов.',
      en: 'Regular collection works in 28-day cycles. This is for situations when help is needed but not urgently. Every 28 days the cycle closes and can be renewed. Suitable for planned expenses.'
    }
  },
  {
    keywords: ['уведомление', 'notification', 'оповещение', 'alert'],
    response: {
      ru: 'Уведомления приходят, когда кому-то в вашей сети нужна помощь. Вы видите, кто просит помощь и как вы с ним связаны (цепочка рукопожатий). Уведомление не требует реакции — вы сами решаете, хотите ли помочь.',
      en: 'Notifications come when someone in your network needs help. You see who is asking and how you\'re connected (handshake chain). The notification doesn\'t require a response — you decide if you want to help.'
    }
  },
  {
    keywords: ['профиль', 'profile', 'аккаунт', 'account'],
    response: {
      ru: 'В профиле видна вся ваша активность: рукопожатия, участие в сборах, выполненные намерения. Это формирует вашу репутацию. Вы можете добавить контакты (телеграм, телефон) чтобы с вами могли связаться.',
      en: 'Your profile shows all your activity: handshakes, collection participation, fulfilled intentions. This forms your reputation. You can add contacts (telegram, phone) so people can reach you.'
    }
  },
  {
    keywords: ['валюта', 'currency', 'доллар', 'dollar', 'usd', 'конвертация', 'convert'],
    response: {
      ru: 'Все суммы в приложении отображаются в долларах (USD) для удобства. Но вводить суммы вы можете в любой валюте — система автоматически конвертирует. Ваша предпочтительная валюта выбирается в настройках.',
      en: 'All amounts in the app are displayed in dollars (USD) for convenience. But you can enter amounts in any currency — the system converts automatically. Your preferred currency is selected in settings.'
    }
  }
];

/**
 * Get response for user query in the specified language
 */
export function getLocalResponse(query: string, lang: string): string {
  const q = query.toLowerCase();
  const isRussian = lang === 'ru' || lang.startsWith('ru');

  // Try to find matching knowledge item
  for (const item of knowledge) {
    if (item.keywords.some(kw => q.includes(kw.toLowerCase()))) {
      return isRussian ? item.response.ru : item.response.en;
    }
  }

  // Default response if no match found
  return isRussian
    ? 'Я могу объяснить как работает приложение. Спросите о: рукопожатиях, намерениях, сборах, текущих возможностях сети, числе Данбара, цепочке рукопожатий, уведомлениях или профиле.'
    : 'I can explain how the app works. Ask about: handshakes, intentions, collections, current network capabilities, Dunbar\'s number, handshake chain, notifications, or profile.';
}
