import json, os, re
dir_path = r"D:\Automation\Development\projects\Social organizer\packages\i18n\locales"
translations = {
    "es": "Aceptando invitaci\u00f3n...",
    "fr": "Acceptation de l\u0027invitation...",
    "de": "Einladung wird angenommen...",
    "pt": "Aceitando convite...",
    "it": "Accettazione dell\u0027invito...",
    "zh": "\u6b63\u5728\u63a5\u53d7\u9080\u8bf7...",
    "ja": "\u62db\u5f85\u3092\u53d7\u3051\u5165\u308c\u3066\u3044\u307e\u3059...",
    "ko": "\ucd08\ub300\ub97c \uc218\ub77d\ud558\ub294 \uc911...",
    "ar": "\u062c\u0627\u0631\u064d \u0642\u0628\u0648\u0644 \u0627\u0644\u062f\u0639\u0648\u0629...",
    "hi": "\u0928\u093f\u092e\u0902\u0924\u094d\u0930\u0923 \u0938\u094d\u0935\u0940\u0915\u093e\u0930 \u0939\u094b \u0930\u0939\u093e \u0939\u0948...",
    "tr": "Davet kabul ediliyor...",
    "pl": "Przyjmowanie zaproszenia...",
    "uk": "\u041f\u0440\u0438\u0439\u043c\u0430\u0454\u043c\u043e \u0437\u0430\u043f\u0440\u043e\u0448\u0435\u043d\u043d\u044f...",
    "nl": "Uitnodiging wordt geaccepteerd...",
    "sv": "Accepterar inbjudan...",
    "da": "Accepterer invitation...",
    "fi": "Hyv\u00e4ksyt\u00e4\u00e4n kutsua...",
    "no": "Godtar invitasjon...",
    "cs": "P\u0159ij\u00edm\u00e1n\u00ed pozv\u00e1nky...",
    "ro": "Se accept\u0103 invita\u021bia...",
    "th": "\u0e01\u0e33\u0e25\u0e31\u0e07\u0e23\u0e31\u0e1a\u0e04\u0e33\u0e40\u0e0a\u0e34\u0e0d...",
    "vi": "\u0110ang ch\u1ea5p nh\u1eadn l\u1eddi m\u1eddi...",
    "id": "Menerima undangan...",
    "sr": "\u041f\u0440\u0438\u0445\u0432\u0430\u0442\u0430\u045a\u0435 \u043f\u043e\u0437\u0438\u0432\u043d\u0438\u0446\u0435..."
}
for lang, text in translations.items():
    fp = os.path.join(dir_path, f"{lang}.json")
    with open(fp, "r", encoding="utf-8") as f:
        content = f.read()
    if chr(34) + "accepting" + chr(34) in content:
        print(f"{lang}: skip")
        continue
    pat = chr(34) + "loginToAccept" + chr(34) + ":" + chr(32) + chr(34)
    idx = content.find(pat)
    if idx == -1:
        print(f"{lang}: NOT FOUND")
        continue
    end_of_line = content.index(chr(10), idx)
    line = content[idx:end_of_line]
    new_line = line + "," + chr(10) + "    " + chr(34) + "accepting" + chr(34) + ": " + chr(34) + text + chr(34)
    new_content = content[:idx] + new_line + content[end_of_line:]
    with open(fp, "w", encoding="utf-8") as f:
        f.write(new_content)
    print(f"{lang}: done")
