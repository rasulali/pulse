import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type TgMessage = { text?: string; chat?: { id: number } };
type TgCallbackQuery = {
  id: string;
  data?: string;
  message?: { chat?: { id: number }; message_id?: number };
};
type TgUpdate = {
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallbackQuery;
};

const tg = (m: string) =>
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${m}`;

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

const translations = {
  en: {
    connected:
      "Connected! You'll start receiving daily reports here.\n\nUse /settings to manage your preferences.",
    userNotFound: "User not found. Please register first.",
    settingsTitle: "Your Current Settings",
    industries: "Industries",
    signals: "Signals",
    language: "Language",
    changeIndustries: "Change Industries",
    changeSignals: "Change Signals",
    changeLanguage: "Change Language",
    backToSettings: "Back to Settings",
    selectIndustries: "Select Industries",
    selectSignals: "Select Signals",
    selectLanguage: "Select Language",
    tapToToggle: "Tap to toggle selection (at least 1 required):",
    chooseLanguage: "Choose your preferred language:",
    atLeastOneIndustry: "At least one industry must be selected",
    atLeastOneSignal: "At least one signal must be selected",
    loadingSettings: "Loading settings...",
    done: "Done",
    close: "Close",
    settingsSaved: "Settings saved!",
  },
  az: {
    connected:
      "Qoşuldu! Burada gündəlik hesabatlar alacaqsınız.\n\nTənzimləmələri idarə etmək üçün /settings istifadə edin.",
    userNotFound:
      "İstifadəçi tapılmadı. Zəhmət olmasa əvvəlcə qeydiyyatdan keçin.",
    settingsTitle: "Cari Tənzimləmələriniz",
    industries: "Sənaye sahələri",
    signals: "Siqnallar",
    language: "Dil",
    changeIndustries: "Sənaye sahələrini dəyişdir",
    changeSignals: "Siqnalları dəyişdir",
    changeLanguage: "Dili dəyişdir",
    backToSettings: "Tənzimləmələrə qayıt",
    selectIndustries: "Sənaye sahələrini seçin",
    selectSignals: "Siqnalları seçin",
    selectLanguage: "Dili seçin",
    tapToToggle: "Seçimi dəyişdirmək üçün toxunun (ən azı 1 lazımdır):",
    chooseLanguage: "Üstünlük verdiyiniz dili seçin:",
    atLeastOneIndustry: "Ən azı bir sənaye sahəsi seçilməlidir",
    atLeastOneSignal: "Ən azı bir siqnal seçilməlidir",
    loadingSettings: "Tənzimləmələr yüklənir...",
    done: "Hazırdır",
    close: "Bağla",
    settingsSaved: "Tənzimləmələr saxlanıldı!",
  },
  ru: {
    connected:
      "Подключено! Вы будете получать ежедневные отчеты здесь.\n\nИспользуйте /settings для управления настройками.",
    userNotFound:
      "Пользователь не найден. Пожалуйста, зарегистрируйтесь сначала.",
    settingsTitle: "Ваши текущие настройки",
    industries: "Отрасли",
    signals: "Сигналы",
    language: "Язык",
    changeIndustries: "Изменить отрасли",
    changeSignals: "Изменить сигналы",
    changeLanguage: "Изменить язык",
    backToSettings: "Вернуться к настройкам",
    selectIndustries: "Выберите отрасли",
    selectSignals: "Выберите сигналы",
    selectLanguage: "Выберите язык",
    tapToToggle: "Нажмите для изменения выбора (минимум 1):",
    chooseLanguage: "Выберите предпочитаемый язык:",
    atLeastOneIndustry: "Должна быть выбрана хотя бы одна отрасль",
    atLeastOneSignal: "Должен быть выбран хотя бы один сигнал",
    loadingSettings: "Загрузка настроек...",
    done: "Готово",
    close: "Закрыть",
    settingsSaved: "Настройки сохранены!",
  },
};

const languageNames: Record<string, string> = {
  en: "English",
  az: "Azərbaycan",
  ru: "Русский",
};

function getTranslations(lang: string) {
  return translations[lang as keyof typeof translations] || translations.en;
}

function getLanguageName(lang: string) {
  return languageNames[lang] || languageNames.en;
}

async function sendMessage(chatId: number, text: string, replyMarkup?: any) {
  return fetch(tg("sendMessage"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    }),
  });
}

async function editMessage(
  chatId: number,
  messageId: number,
  text: string,
  replyMarkup?: any,
) {
  return fetch(tg("editMessageText"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    }),
  });
}

async function answerCallback(callbackId: string, text?: string) {
  return fetch(tg("answerCallbackQuery"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackId,
      text,
    }),
  });
}

async function handleStart(chatId: number, token: string) {
  const supabase = sb();
  const { data: rows } = await supabase
    .from("users")
    .select("id, telegram_chat_id, languages")
    .eq("telegram_start_token", token)
    .limit(1);

  if (!rows?.length) return;
  const user = rows[0];
  if (user.telegram_chat_id) return;

  const { error: updErr } = await supabase
    .from("users")
    .update({ telegram_chat_id: chatId })
    .eq("id", user.id);

  if (updErr) {
    console.error("[webhook] Failed to update telegram_chat_id:", updErr);
    return;
  }

  const userLang = user.languages?.[0] || "en";
  const t = getTranslations(userLang);

  await sendMessage(chatId, t.connected);
}

async function handleSettings(chatId: number) {
  const supabase = sb();
  const { data: user } = await supabase
    .from("users")
    .select("industry_ids, signal_ids, languages")
    .eq("telegram_chat_id", chatId)
    .single();

  if (!user) {
    const t = getTranslations("en");
    await sendMessage(chatId, t.userNotFound);
    return;
  }

  const currentLang = user.languages?.[0] || "en";
  const t = getTranslations(currentLang);

  const [{ data: industries }, { data: signals }] = await Promise.all([
    supabase
      .from("industries")
      .select("id, name")
      .eq("visible", true)
      .order("name"),
    supabase
      .from("signals")
      .select("id, name")
      .eq("visible", true)
      .order("name"),
  ]);

  const selectedIndustries = (industries || [])
    .filter((i) => user.industry_ids.includes(i.id))
    .map((i) => i.name)
    .join(", ");

  const selectedSignals = (signals || [])
    .filter((s) => user.signal_ids.includes(s.id))
    .map((s) => s.name)
    .join(", ");

  const text = `<b>${t.settingsTitle}</b>\n\n<b>${t.industries}:</b> ${selectedIndustries}\n\n<b>${t.signals}:</b> ${selectedSignals}\n\n<b>${t.language}:</b> ${getLanguageName(currentLang)}`;

  const keyboard = {
    inline_keyboard: [
      [{ text: t.changeIndustries, callback_data: "settings:industries" }],
      [{ text: t.changeSignals, callback_data: "settings:signals" }],
      [{ text: t.changeLanguage, callback_data: "settings:language" }],
      [{ text: t.close, callback_data: "settings:close" }],
    ],
  };

  await sendMessage(chatId, text, keyboard);
}

async function handleIndustriesMenu(chatId: number, messageId?: number) {
  const supabase = sb();
  const { data: user } = await supabase
    .from("users")
    .select("industry_ids, languages")
    .eq("telegram_chat_id", chatId)
    .single();

  if (!user) return;

  const currentLang = user.languages?.[0] || "en";
  const t = getTranslations(currentLang);

  const { data: industries } = await supabase
    .from("industries")
    .select("id, name")
    .eq("visible", true)
    .order("name");

  if (!industries) return;

  const keyboard = {
    inline_keyboard: [
      ...industries.map((ind) => {
        const isSelected = user.industry_ids.includes(ind.id);
        return [
          {
            text: `${isSelected ? "[x]" : "[ ]"} ${ind.name}`,
            callback_data: `toggle:industry:${ind.id}`,
          },
        ];
      }),
      [
        { text: `« ${t.backToSettings}`, callback_data: "settings:main" },
        { text: t.done, callback_data: "settings:close" },
      ],
    ],
  };

  const text = `<b>${t.selectIndustries}</b>\n\n${t.tapToToggle}`;

  if (messageId) {
    await editMessage(chatId, messageId, text, keyboard);
  } else {
    await sendMessage(chatId, text, keyboard);
  }
}

async function handleSignalsMenu(chatId: number, messageId?: number) {
  const supabase = sb();
  const { data: user } = await supabase
    .from("users")
    .select("signal_ids, languages")
    .eq("telegram_chat_id", chatId)
    .single();

  if (!user) return;

  const currentLang = user.languages?.[0] || "en";
  const t = getTranslations(currentLang);

  const { data: signals } = await supabase
    .from("signals")
    .select("id, name")
    .eq("visible", true)
    .order("name");

  if (!signals) return;

  const keyboard = {
    inline_keyboard: [
      ...signals.map((sig) => {
        const isSelected = user.signal_ids.includes(sig.id);
        return [
          {
            text: `${isSelected ? "[x]" : "[ ]"} ${sig.name}`,
            callback_data: `toggle:signal:${sig.id}`,
          },
        ];
      }),
      [
        { text: `« ${t.backToSettings}`, callback_data: "settings:main" },
        { text: t.done, callback_data: "settings:close" },
      ],
    ],
  };

  const text = `<b>${t.selectSignals}</b>\n\n${t.tapToToggle}`;

  if (messageId) {
    await editMessage(chatId, messageId, text, keyboard);
  } else {
    await sendMessage(chatId, text, keyboard);
  }
}

async function handleLanguageMenu(chatId: number, messageId?: number) {
  const supabase = sb();
  const { data: user } = await supabase
    .from("users")
    .select("languages")
    .eq("telegram_chat_id", chatId)
    .single();

  if (!user) return;

  const currentLang = user.languages?.[0] || "en";
  const t = getTranslations(currentLang);

  const languages = [
    { code: "en", name: "English" },
    { code: "az", name: "Azərbaycan" },
    { code: "ru", name: "Русский" },
  ];

  const keyboard = {
    inline_keyboard: [
      ...languages.map((lang) => [
        {
          text: `${currentLang === lang.code ? "[x]" : "[ ]"} ${lang.name}`,
          callback_data: `set:language:${lang.code}`,
        },
      ]),
      [{ text: `« ${t.backToSettings}`, callback_data: "settings:main" }],
    ],
  };

  const text = `<b>${t.selectLanguage}</b>\n\n${t.chooseLanguage}`;

  if (messageId) {
    await editMessage(chatId, messageId, text, keyboard);
  } else {
    await sendMessage(chatId, text, keyboard);
  }
}

async function handleToggle(
  chatId: number,
  type: "industry" | "signal",
  id: number,
  messageId?: number,
) {
  const supabase = sb();

  if (type === "industry") {
    const { data: user } = await supabase
      .from("users")
      .select("industry_ids, languages")
      .eq("telegram_chat_id", chatId)
      .single();

    if (!user) return { success: false };

    const currentLang = user.languages?.[0] || "en";
    const t = getTranslations(currentLang);

    const currentIds = user.industry_ids as number[];
    const isSelected = currentIds.includes(id);

    let newIds: number[];
    if (isSelected) {
      if (currentIds.length === 1) {
        return { success: false, error: t.atLeastOneIndustry };
      }
      newIds = currentIds.filter((i) => i !== id);
    } else {
      newIds = [...currentIds, id];
    }

    const { error } = await supabase
      .from("users")
      .update({ industry_ids: newIds })
      .eq("telegram_chat_id", chatId);

    if (error) return { success: false };

    await handleIndustriesMenu(chatId, messageId);
  } else {
    const { data: user } = await supabase
      .from("users")
      .select("signal_ids, languages")
      .eq("telegram_chat_id", chatId)
      .single();

    if (!user) return { success: false };

    const currentLang = user.languages?.[0] || "en";
    const t = getTranslations(currentLang);

    const currentIds = user.signal_ids as number[];
    const isSelected = currentIds.includes(id);

    let newIds: number[];
    if (isSelected) {
      if (currentIds.length === 1) {
        return { success: false, error: t.atLeastOneSignal };
      }
      newIds = currentIds.filter((i) => i !== id);
    } else {
      newIds = [...currentIds, id];
    }

    const { error } = await supabase
      .from("users")
      .update({ signal_ids: newIds })
      .eq("telegram_chat_id", chatId);

    if (error) return { success: false };

    await handleSignalsMenu(chatId, messageId);
  }

  return { success: true };
}

async function deleteMessage(chatId: number, messageId: number) {
  return fetch(tg("deleteMessage"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
    }),
  });
}

async function handleSetLanguage(
  chatId: number,
  langCode: string,
  messageId?: number,
) {
  const supabase = sb();

  const { error } = await supabase
    .from("users")
    .update({ languages: [langCode] })
    .eq("telegram_chat_id", chatId);

  if (error) return { success: false };

  const t = getTranslations(langCode);

  if (messageId) {
    await deleteMessage(chatId, messageId);
  }

  await sendMessage(chatId, t.settingsSaved);

  return { success: true };
}

async function handleCallback(query: TgCallbackQuery) {
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  const data = query.data;

  if (!chatId || !data) return;

  if (data === "settings:close") {
    if (messageId) {
      await deleteMessage(chatId, messageId);
    }
    await answerCallback(query.id);
    return;
  }

  if (data === "settings:main") {
    if (messageId) {
      const supabase = sb();
      const { data: user } = await supabase
        .from("users")
        .select("languages")
        .eq("telegram_chat_id", chatId)
        .single();

      const currentLang = user?.languages?.[0] || "en";
      const t = getTranslations(currentLang);
      await editMessage(chatId, messageId, t.loadingSettings, undefined);
    }
    await handleSettings(chatId);
  } else if (data === "settings:industries") {
    await handleIndustriesMenu(chatId, messageId);
  } else if (data === "settings:signals") {
    await handleSignalsMenu(chatId, messageId);
  } else if (data === "settings:language") {
    await handleLanguageMenu(chatId, messageId);
  } else if (data.startsWith("toggle:")) {
    const [, type, idStr] = data.split(":");
    const result = await handleToggle(
      chatId,
      type as "industry" | "signal",
      parseInt(idStr),
      messageId,
    );
    if (!result.success && result.error) {
      await answerCallback(query.id, result.error);
      return;
    }
  } else if (data.startsWith("set:language:")) {
    const langCode = data.split(":")[2];
    await handleSetLanguage(chatId, langCode, messageId);
    await answerCallback(query.id);
    return;
  }

  await answerCallback(query.id);
}

export async function POST(req: Request) {
  if (
    req.headers.get("x-telegram-bot-api-secret-token") !==
    process.env.TELEGRAM_WEBHOOK_SECRET
  )
    return new NextResponse("forbidden", { status: 403 });

  const update = (await req.json()) as TgUpdate;

  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return NextResponse.json({ ok: true });
  }

  const msg = update.message ?? update.edited_message;
  const text = msg?.text?.trim();
  const chatId = msg?.chat?.id;
  if (!text || !chatId) return NextResponse.json({ ok: true });

  if (text.startsWith("/start")) {
    const m = /^\/start\s+(\S+)/.exec(text);
    if (m) {
      await handleStart(chatId, m[1]);
    }
  } else if (text === "/settings") {
    await handleSettings(chatId);
  }

  return NextResponse.json({ ok: true });
}
