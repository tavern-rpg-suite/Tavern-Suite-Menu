import { getContext, extension_settings } from '../../../extensions.js';
import * as stExtensions from '../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced, getRequestHeaders, setUserName, deleteCharacter } from '../../../../script.js';
import { openGroupById, editGroup } from '../../../group-chats.js';
import { setUserAvatar, user_avatar, initPersona, getUserAvatars } from '../../../personas.js';
import { power_user } from '../../../power-user.js';
import { tags as stTags, tag_map as stTagMap, addTagsToEntity, removeTagFromEntity } from '../../../tags.js';
import { DEFAULT_FILTER_STATE } from '../../../filters.js';
import { world_names } from '../../../world-info.js';

/* ============================================================
   Tavern Suite Menu — a visual-novel main menu over SillyTavern.
   It only READS what the rest of the suite keeps: the map's rooms,
   chronicle, routines and overheard scenes, the diary's people,
   events and gifts, the phone's unread letters, the scene card.
   Nothing here writes into another extension. Opening a module
   happens through that module's own button, exactly as a click.
   ============================================================ */

const MODULE = 'rpg_hub';
const BASE = new URL('.', import.meta.url).href;
const PER_PAGE = 4;
const SNAP_MAX = 40;
const DAY_PARTS = ['morning', 'day', 'evening', 'night'];
const ACCENTS = ['#c6a15b', '#c03a4b', '#9fb7c9', '#a7c08f'];

const defaults = {
    enabled: true,
    onStartup: true,
    bg: 'scene',          // scene | random | st
    accent: '#c6a15b',
    motion: 'full',       // full | calm
    language: '',         // '' = follow SillyTavern
    sound: true,          // small game sounds on choices
    hidden: [],           // characters/groups kept out of the menu ('c:avatar' | 'g:id'); SillyTavern is untouched
    showcase: [],         // tag ids: when set, the menu shows only what carries one of them
    volume: 40,           // 0..100
    snaps: {},            // chatId -> what the menu shows for that chat when it is not open
    seen: {},             // chatId -> { chron, heard } — for the red gem on a medallion
};
let settings = null;

/* ============================================================ I18N */
const I18N = {
    en: {
        title: 'Tavern Suite Menu',
        open_menu: 'Open the menu',
        set_enabled: 'Enabled',
        set_startup: 'Show the menu when SillyTavern starts',
        set_bg: 'Menu background',
        bg_scene: 'The room you are in',
        bg_random: 'A random room from the map',
        bg_st: 'The chat background',
        set_bg_hint: 'Rooms come from RPG Map. Without a picture, the chat background is used.',
        set_accent: 'Accent',
        set_motion: 'Motion',
        motion_full: 'Full',
        motion_calm: 'Calm (no animation)',
        set_lang: 'Language',
        lang_auto: 'Like SillyTavern',
        continue: 'Continue',
        enter: 'ENTER',
        place: 'place',
        room: 'room',
        day_n: 'DAY {n}',
        deck: 'Characters',
        deck_cap: 'DECK · {n}',
        dossier: 'Dossier',
        case_no: 'CASE №{n}',
        secret: 'SECRET',
        diary: 'Diary',
        diary_cap: 'SECRET DIARY',
        map: 'Map',
        who_where: 'who is where',
        chronicle: 'Chronicle',
        while_away: 'WHILE YOU WERE AWAY',
        quiet: 'Quiet so far.',
        calendar: 'Calendar',
        heard: 'Overheard',
        gifts: 'Gifts',
        meetings: 'Meetings',
        rooms: 'Rooms',
        you: 'You',
        phone: 'Phone',
        settings: 'Settings',
        close: 'Close',
        letters: 'Letters {n}',
        secrets: 'Secrets {n}',
        no_chat: 'No chats yet. Pick someone from the deck.',
        bg_from: 'background: {name}',
        with_you: 'with you',
        away: 'away',
        entries_n: 'entries {n}',
        events_n: 'events {n}',
        gifts_n: 'gifts {n}',
        not_installed: '{name} is not installed',
        p_chron_lead: 'What the others did while you were not looking — from RPG Map.',
        p_cal_lead: 'Events the diary remembers.',
        p_heard_lead: 'Through a door, or in a letter.',
        h_all: 'All', h_letters: 'Letters', h_doors: 'Doors', h_none: 'Nothing of this kind yet.', h_post: 'Post', h_from: 'from {place}', h_untitled: 'A letter',
        h_sealed: 'sealed', h_voices: 'voices', cal_sticky: 'This month', cal_count: 'days marked: {n}', cal_leaf: 'Leaf {n} of {of}',
        p_gifts_lead: 'Given and received.',
        p_recent_lead: 'Your latest chats.',
        p_rooms_lead: 'Every room with a picture. Click one to set it behind the menu.',
        empty: 'Nothing here yet.',
        bg_set: 'The menu background is now “{name}”.',
        all: 'All',
        fav: 'Favourites',
        groups: 'Groups',
        all_tags: 'All tags',
        sort_recent: 'Recent first',
        sort_name: 'By name',
        search: 'Search…',
        import: 'Import',
        create: 'Create',
        start_chat: 'Start chat',
        group_chat: 'Group chat',
        open_dossier: 'Open dossier',
        group_n: 'group chat · {n}',
        page_of: '{p} / {n} · {c} in the deck',
        prev: 'Previous',
        next: 'Next',
        page: 'Page {n}',
        nobody: 'Nobody matches.',
        back_deck: 'The deck',
        back_menu: 'Menu',
        trust: 'trust {n}',
        f_role: 'Role',
        f_met: 'How met',
        f_look: 'Looks',
        f_note: 'Notes',
        f_where: 'Now',
        f_card: 'From the card',
        f_last: 'Last chat',
        testimony: 'Testimony',
        one_day: 'One day',
        weekdays: 'Weekdays',
        weekend: 'Weekend',
        part_morning: 'Morning', part_day: 'Day', part_evening: 'Evening', part_night: 'Night',
        no_routine: 'No routine yet — RPG Map writes one in “Who is where”.',
        now: 'NOW',
        unknown: 'unknown',
        who_linked: 'Who is linked to whom',
        from_chron: 'from the chronicle',
        shared_secret: 'SHARED SECRET',
        where_now: 'WHERE NOW',
        chosen: 'CHOSEN · {name}',
        own_dossier: 'Personal dossier',
        together: 'Together, off screen',
        open_chat: 'Open chat',
        phone_shared: 'Phone',
        group_sub: '{n} characters',
        no_links: 'No shared lines in the chronicle yet.',
        letter: 'letter',
        door: 'through the door',
        gave: 'gave',
        got: 'got',
        opening: 'Opening…',
        open_failed: 'Could not open this chat.',
        module_off: '{name} is switched off — turn it on in its settings.',
        new_group: 'New group',
        hide: 'Hide from the menu', unhide: 'Show in the menu again', hidden_now: 'Hidden from the menu — it waits in “Hidden”. Nothing is deleted.', unhidden: 'Back in the menu.',
        hidden_tab: 'Hidden {n}', showcase_tip: 'Show only what has this tag, everywhere in the menu', showcase_only: 'Only: {names}', showcase_clear: 'Show everything again',
        dng: 'Rabbit hole', dng_cap: 'GACHA · DREAMS', dng_unforged: 'no dream yet', dng_stats: 'companions {n}',
        set_sound: 'Sounds',
        back_dossier: 'The dossier', ce_new: 'A new character', ce_edit: 'Edit the card', ce_new_k: 'NEW CARD', ce_edit_k: 'THE CARD',
        ce_pic: 'A portrait', ce_name_ph: 'Their name', ce_name_lock: 'The name is changed in SillyTavern’s own editor',
        ce_desc: 'Description', ce_pers: 'Personality', ce_scen: 'Scenario', ce_first: 'First message',
        fs_edit: 'rewrite', fs_fill: 'fill in', fs_esc: 'Esc or a click outside puts it back', fs_done: 'File it', fs_chars: '{n} chars',
        fs_look_e: 'Empty. What do they look like?', fs_soul_e: 'Empty. Who are they inside?', fs_voice_e: 'Empty. How do they speak?', fs_ai_e: 'Nothing for the model yet.', fs_notes_e: 'No notes.',
        fs_look_q: 'What do they look like? What shows at first sight — and what do they hide?', fs_soul_q: 'What are they like inside? Where and when does the story begin?',
        fs_voice_q: 'With what words do they walk in? How do they talk?', fs_ai_q: 'Quiet orders for the model — nobody sees them in the chat.', fs_notes_q: 'For people: where the card is from, how to play it. The model does not read this.',
        fs_subject: 'Subject', fs_status: 'File status', fs_ready: 'Complete', fs_pct: 'Filled {n}%',
        fs_about_e: 'Empty. Who are you in this story?', fs_lore_e: 'No lorebook.', fs_about_q: 'Who are you here? The model reads this.', fs_prompt_q: 'Where your description goes in the prompt.',
        fs_lore_q: 'Pick a book from the shelf.', fs_no_books: 'No lorebooks in SillyTavern yet.', fs_links: 'Linked to', fs_links_e: 'Not linked to anyone. Links are set in SillyTavern.',
        fs_draft: 'Draft', fs_reserve: 'In reserve', fs_saved: 'All filed', fs_unsaved: 'File or cancel the changes first.', you_pos_h4l: 'into the chat, at a depth',
        ce_t_look: 'Look', ce_t_soul: 'Soul', ce_t_voice: 'Voice', ce_t_ai: 'For the AI', ce_t_notes: 'Notes',
        ce_creator: 'Creator', ce_version: 'Version', ce_talk: 'Talkativeness', ce_talk_h: 'how often they speak in a group', ce_fav_on: 'In favourites', ce_fav_off: 'Add to favourites',
        ce_greets: 'Other greetings', ce_greet_add: 'Add a greeting', ce_greet_del: 'Remove this greeting',
        ce_examples: 'Example dialogue', ce_examples_h: 'starts with <START>', ce_sys: 'System prompt', ce_sys_h: 'replaces the main one', ce_post: 'Post-history instructions', ce_post_h: 'after the chat',
        ce_note: 'Character’s note', ce_note_h: 'put into the chat at a depth', ce_depth: 'Depth', ce_role: 'Role', ce_role_system: 'System', ce_role_user: 'User', ce_role_assistant: 'Assistant',
        ce_cnotes: 'Creator’s notes', ce_cnotes_h: 'for people, the model does not read it', ce_weight: '{n} characters', ce_tokens: 'tokens', ce_greets_n: 'greetings: {n}',
        ce_del: 'Delete the character', ce_del_sure: 'Delete for good? (chats stay)', ce_created: '“{name}” is in the deck.', ce_deleted: 'Character deleted. Their chats are kept.',
        you_edit: 'Edit this face', you_new: 'A new face', you_name: 'Name', you_title: 'Title', you_about: 'About', you_name_ph: 'How they call you',
        you_def_on: 'Default face', you_def_off: 'Make default', you_def_h: 'used in new chats', you_about_h: 'the model reads this',
        you_pos: 'In the prompt', you_pos0: 'In the prompt', you_pos2: 'Above A/N', you_pos3: 'Below A/N', you_pos4: 'At depth', you_pos9: 'Off', you_pos_now: 'Where it goes',
        you_pos_h0: 'with the story string / prompt manager', you_pos_h2: 'at the top of the Author’s Note', you_pos_h3: 'at the bottom of the Author’s Note', you_pos_h9: 'the model does not get it', you_pos_h4: '',
        you_lore: 'Lorebook', you_lore_none: 'none',
        you_title_ph: 'shown only here', you_about_ph: 'Who you are — the model reads this', you_create: 'Create', you_del: 'Delete this face', you_del_sure: 'Delete for good?',
        you_pic: 'Another portrait', you_face: 'A FACE OF YOURS', you_become: 'Become this face', you_active: 'ACTIVE', you_need_name: 'Give the face a name.',
        you_saved: 'Saved.', you_deleted: 'Face deleted.', you_bad_pic: 'A PNG, JPEG, WebP or GIF up to 10 MB.',
        tags: 'Tags', tags_for: 'Tags · {name}', tags_none: 'No tags yet — make the first one below.', tag_new: 'New tag', tag_new_ph: 'New tag…',
        tag_rename: 'Rename, recolour, delete', tag_nocolor: 'no colour', tag_del: 'Delete', tag_del_sure: 'Sure?', tag_need_name: 'The tag needs a name.',
        set_volume: 'Volume',
        edit_group: 'Edit group',
        group_name_ph: 'Group name',
        picked_n: 'Chosen: {n}',
        create_group: 'Create group',
        save: 'Save',
        cancel: 'Cancel',
        delete_group: 'Delete group',
        delete_sure: 'Delete for good? Its chats too',
        cant_delete_open: 'This group’s chat is open — switch to another chat to delete it.',
        group_created: 'Group “{name}” created.',
        group_saved: 'Group saved.',
        group_deleted: 'Group deleted.',
        need_member: 'Pick at least one character.',
        group_default: 'Group: {names}',
        save_failed: 'Could not save — see the console.',
        back_group: 'The group',
        party_pick: 'Pick from the deck',
        sort_switch: 'Switch the order',
        other_bg: 'Another room behind',
        you_kicker: 'YOU',
        you_sheet: 'Who you are',
        you_empty: 'No description yet — press the pen to write one.',
        you_faces: 'Your other faces',
        you_manage: 'Persona settings',
        you_switched: 'You are now {name}.',
        d_entries: 'Entries', d_events: 'Events', d_people: 'People', d_gifts: 'Gifts', d_summary: 'Summary',
        open_in_ext: 'Open {name}',
        here_now: 'Here now:',
        p_more: 'read', p_less: 'put back',
        bk_cont: 'continued', bk_end: 'The rest of the page is blank.', bk_spread: 'spread {p} of {n}',
    },
    ru: {
        title: 'Tavern Suite Menu',
        open_menu: 'Открыть меню',
        set_enabled: 'Включено',
        set_startup: 'Показывать меню при запуске SillyTavern',
        set_bg: 'Фон меню',
        bg_scene: 'Комната, где вы сейчас',
        bg_random: 'Случайная комната с карты',
        bg_st: 'Фон чата',
        set_bg_hint: 'Комнаты берутся из RPG Map. Без картинки — фон чата.',
        set_accent: 'Акцент',
        set_motion: 'Анимация',
        motion_full: 'Полная',
        motion_calm: 'Спокойно (без анимации)',
        set_lang: 'Язык',
        lang_auto: 'Как в SillyTavern',
        continue: 'Продолжить',
        enter: 'ВОЙТИ',
        place: 'место',
        room: 'комната',
        day_n: 'ДЕНЬ {n}',
        deck: 'Персонажи',
        deck_cap: 'КОЛОДА ГЕРОЕВ · {n}',
        dossier: 'Досье',
        case_no: 'ДЕЛО №{n}',
        secret: 'СЕКРЕТНО',
        diary: 'Дневник',
        diary_cap: 'ТАЙНЫЙ ДНЕВНИК',
        map: 'Карта',
        who_where: 'кто где',
        chronicle: 'Хроника',
        while_away: 'ПОКА ТЕБЯ НЕ БЫЛО',
        quiet: 'Пока тихо.',
        calendar: 'Календарь',
        heard: 'Подслушано',
        gifts: 'Подарки',
        meetings: 'Встречи',
        rooms: 'Комнаты',
        you: 'Ты',
        phone: 'Телефон',
        settings: 'Настройки',
        close: 'Закрыть',
        letters: 'Письма {n}',
        secrets: 'Тайны {n}',
        no_chat: 'Чатов пока нет. Выбери кого-нибудь в колоде.',
        bg_from: 'фон: {name}',
        with_you: 'с тобой',
        away: 'не здесь',
        entries_n: 'записи {n}',
        events_n: 'события {n}',
        gifts_n: 'подарки {n}',
        not_installed: '{name} не установлен',
        p_chron_lead: 'Что делали остальные, пока ты не смотрела, — из RPG Map.',
        p_cal_lead: 'События, которые помнит дневник.',
        p_heard_lead: 'Из-за двери или в письме.',
        h_all: 'Всё', h_letters: 'Письма', h_doors: 'Двери', h_none: 'Такого пока нет.', h_post: 'Почта', h_from: 'из: {place}', h_untitled: 'Письмо',
        h_sealed: 'запечатано', h_voices: 'голоса', cal_sticky: 'Отмечено', cal_count: 'дней: {n}', cal_leaf: 'Лист {n} из {of}',
        p_gifts_lead: 'Подаренное и полученное.',
        p_recent_lead: 'Последние чаты.',
        p_rooms_lead: 'Все комнаты с картинкой. Нажми — и она встанет фоном меню.',
        empty: 'Здесь пока пусто.',
        bg_set: 'Фон меню — «{name}».',
        all: 'Все',
        fav: 'Избранное',
        groups: 'Группы',
        all_tags: 'Все теги',
        sort_recent: 'Сначала недавние',
        sort_name: 'По имени',
        search: 'Поиск…',
        import: 'Импорт',
        create: 'Создать',
        start_chat: 'Начать чат',
        group_chat: 'Групповой чат',
        open_dossier: 'Открыть досье',
        group_n: 'групповой чат · {n}',
        page_of: '{p} / {n} · {c} в колоде',
        prev: 'Предыдущие',
        next: 'Следующие',
        page: 'Страница {n}',
        nobody: 'Никого не нашлось.',
        back_deck: 'Колода героев',
        back_menu: 'Меню',
        trust: 'доверие {n}',
        f_role: 'Роль',
        f_met: 'Знакомство',
        f_look: 'Внешность',
        f_note: 'Заметки',
        f_where: 'Сейчас',
        f_card: 'Из карточки',
        f_last: 'Последний чат',
        testimony: 'Показания',
        one_day: 'Один день',
        weekdays: 'Будни',
        weekend: 'Выходные',
        part_morning: 'Утро', part_day: 'День', part_evening: 'Вечер', part_night: 'Ночь',
        no_routine: 'Распорядка пока нет — его пишет RPG Map в «Кто где».',
        now: 'СЕЙЧАС',
        unknown: 'неизвестно',
        who_linked: 'Кто с кем связан',
        from_chron: 'из хроники',
        shared_secret: 'ОБЩАЯ ТАЙНА',
        where_now: 'ГДЕ СЕЙЧАС',
        chosen: 'ВЫБРАН · {name}',
        own_dossier: 'Личное досье',
        together: 'Вместе за кадром',
        open_chat: 'Открыть чат',
        phone_shared: 'Телефон',
        group_sub: 'героев: {n}',
        no_links: 'Общих строк в хронике пока нет.',
        letter: 'письмо',
        door: 'из-за двери',
        gave: 'подарено',
        got: 'получено',
        opening: 'Открываю…',
        open_failed: 'Не получилось открыть этот чат.',
        module_off: '{name} выключен — включи его в настройках.',
        new_group: 'Новая группа',
        hide: 'Спрятать из меню', unhide: 'Вернуть в меню', hidden_now: 'Спрятано из меню — лежит во вкладке «Скрытые». Ничего не удалено.', unhidden: 'Снова в меню.',
        hidden_tab: 'Скрытые {n}', showcase_tip: 'Показывать везде в меню только то, что с этим тегом', showcase_only: 'Только: {names}', showcase_clear: 'Показать всё снова',
        dng: 'Кроличья нора', dng_cap: 'ГАЧА · СНЫ', dng_unforged: 'сон ещё не создан', dng_stats: 'спутники {n}',
        set_sound: 'Звуки',
        back_dossier: 'К досье', ce_new: 'Новый персонаж', ce_edit: 'Изменить карточку', ce_new_k: 'НОВАЯ КАРТА', ce_edit_k: 'КАРТОЧКА',
        ce_pic: 'Портрет', ce_name_ph: 'Его имя', ce_name_lock: 'Имя меняется в редакторе самого SillyTavern',
        ce_desc: 'Описание', ce_pers: 'Личность', ce_scen: 'Сценарий', ce_first: 'Первое сообщение',
        fs_edit: 'переписать', fs_fill: 'заполнить', fs_esc: 'Esc или клик мимо — положить обратно', fs_done: 'Подшить', fs_chars: '{n} симв.',
        fs_look_e: 'Пусто. Как он выглядит?', fs_soul_e: 'Пусто. Какой он внутри?', fs_voice_e: 'Пусто. Как он говорит?', fs_ai_e: 'Для модели пока ничего.', fs_notes_e: 'Примечаний нет.',
        fs_look_q: 'Как он выглядит? Что видно с первого взгляда — и что он прячет?', fs_soul_q: 'Какой у него характер? Где и когда начинается история?',
        fs_voice_q: 'С каких слов он войдёт в историю? Как он говорит?', fs_ai_q: 'Тайные указания для модели — в чате их не видно.', fs_notes_q: 'Для людей: откуда карточка, как в неё играть. Модель это не читает.',
        fs_subject: 'Объект', fs_status: 'Статус дела', fs_ready: 'Дело собрано', fs_pct: 'Заполнено {n}%',
        fs_about_e: 'Пусто. Кто ты в этой истории?', fs_lore_e: 'Лорбука нет.', fs_about_q: 'Кто ты здесь? Это читает модель.', fs_prompt_q: 'Куда в промпт идёт твоё описание.',
        fs_lore_q: 'Выбери книгу с полки.', fs_no_books: 'В SillyTavern пока нет лорбуков.', fs_links: 'Привязана к', fs_links_e: 'Ни к кому не привязана. Привязки ставятся в SillyTavern.',
        fs_draft: 'Черновик', fs_reserve: 'В запасе', fs_saved: 'Всё подшито', fs_unsaved: 'Сначала подшей или отмени изменения.', you_pos_h4l: 'в чат, на глубину',
        ce_t_look: 'Облик', ce_t_soul: 'Суть', ce_t_voice: 'Голос', ce_t_ai: 'Для ИИ', ce_t_notes: 'Примечания',
        ce_creator: 'Автор', ce_version: 'Версия', ce_talk: 'Разговорчивость', ce_talk_h: 'как часто говорит в группе', ce_fav_on: 'В избранном', ce_fav_off: 'В избранное',
        ce_greets: 'Другие приветствия', ce_greet_add: 'Добавить приветствие', ce_greet_del: 'Убрать это приветствие',
        ce_examples: 'Примеры диалога', ce_examples_h: 'начинаются с <START>', ce_sys: 'Системный промпт', ce_sys_h: 'заменяет основной', ce_post: 'Инструкции после истории', ce_post_h: 'после чата',
        ce_note: 'Заметка персонажа', ce_note_h: 'вставляется в чат на глубину', ce_depth: 'Глубина', ce_role: 'Роль', ce_role_system: 'Система', ce_role_user: 'Пользователь', ce_role_assistant: 'Ассистент',
        ce_cnotes: 'Примечания автора', ce_cnotes_h: 'для людей, модель их не читает', ce_weight: '{n} симв.', ce_tokens: 'токенов', ce_greets_n: 'приветствий: {n}',
        ce_del: 'Удалить персонажа', ce_del_sure: 'Удалить насовсем? (чаты останутся)', ce_created: '«{name}» в колоде.', ce_deleted: 'Персонаж удалён. Его чаты сохранены.',
        you_edit: 'Изменить это лицо', you_new: 'Новое лицо', you_name: 'Имя', you_title: 'Титул', you_about: 'О себе', you_name_ph: 'Как тебя зовут',
        you_def_on: 'Лицо по умолчанию', you_def_off: 'Сделать основным', you_def_h: 'для новых чатов', you_about_h: 'это читает модель',
        you_pos: 'В промпте', you_pos0: 'В промпте', you_pos2: 'Над A/N', you_pos3: 'Под A/N', you_pos4: 'На глубине', you_pos9: 'Выкл.', you_pos_now: 'Куда идёт',
        you_pos_h0: 'вместе со story string / менеджером промптов', you_pos_h2: 'в начало заметки автора', you_pos_h3: 'в конец заметки автора', you_pos_h9: 'модель её не получает', you_pos_h4: '',
        you_lore: 'Лорбук', you_lore_none: 'нет',
        you_title_ph: 'видно только здесь', you_about_ph: 'Кто ты — это читает модель', you_create: 'Создать', you_del: 'Удалить это лицо', you_del_sure: 'Удалить насовсем?',
        you_pic: 'Другой портрет', you_face: 'ОДНО ИЗ ТВОИХ ЛИЦ', you_become: 'Стать этим лицом', you_active: 'АКТИВНО', you_need_name: 'Дай лицу имя.',
        you_saved: 'Сохранено.', you_deleted: 'Лицо удалено.', you_bad_pic: 'PNG, JPEG, WebP или GIF до 10 МБ.',
        tags: 'Теги', tags_for: 'Теги · {name}', tags_none: 'Тегов пока нет — создай первый ниже.', tag_new: 'Новый тег', tag_new_ph: 'Новый тег…',
        tag_rename: 'Переименовать, перекрасить, удалить', tag_nocolor: 'без цвета', tag_del: 'Удалить', tag_del_sure: 'Точно?', tag_need_name: 'Тегу нужно имя.',
        set_volume: 'Громкость',
        edit_group: 'Изменить группу',
        group_name_ph: 'Название группы',
        picked_n: 'Выбрано: {n}',
        create_group: 'Создать группу',
        save: 'Сохранить',
        cancel: 'Отмена',
        delete_group: 'Удалить группу',
        delete_sure: 'Удалить насовсем? И её чаты тоже',
        cant_delete_open: 'Чат этой группы сейчас открыт — переключись на другой чат, чтобы удалить.',
        group_created: 'Группа «{name}» создана.',
        group_saved: 'Группа сохранена.',
        group_deleted: 'Группа удалена.',
        need_member: 'Выбери хотя бы одного персонажа.',
        group_default: 'Группа: {names}',
        save_failed: 'Не получилось сохранить — подробности в консоли.',
        back_group: 'К группе',
        party_pick: 'Выбери из колоды',
        sort_switch: 'Поменять порядок',
        other_bg: 'Другая комната на фоне',
        you_kicker: 'ТЫ',
        you_sheet: 'Кто ты',
        you_empty: 'Описания пока нет — нажми на перо, чтобы написать.',
        you_faces: 'Другие твои лица',
        you_manage: 'Настройки персон',
        you_switched: 'Теперь ты — {name}.',
        d_entries: 'Записи', d_events: 'События', d_people: 'Люди', d_gifts: 'Подарки', d_summary: 'Сводка',
        open_in_ext: 'Открыть {name}',
        here_now: 'Здесь сейчас:',
        p_more: 'читать', p_less: 'отложить',
        bk_cont: 'продолжение', bk_end: 'Дальше страница пуста.', bk_spread: 'разворот {p} из {n}',
    },
};
function lang() {
    if (settings && (settings.language === 'ru' || settings.language === 'en')) return settings.language;
    let loc = '';
    try { loc = String((getContext().getCurrentLocale && getContext().getCurrentLocale()) || localStorage.getItem('language') || navigator.language || ''); } catch (e) { /* ignore */ }
    return /^ru/i.test(loc) ? 'ru' : 'en';
}
function t(key, vars) {
    let s = (I18N[lang()] || I18N.en)[key];
    if (s === undefined) s = I18N.en[key];
    if (s === undefined) s = key;
    if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
    return s;
}

/* ============================================================ SETTINGS */
function loadSettings() {
    if (!extension_settings[MODULE] || typeof extension_settings[MODULE] !== 'object') extension_settings[MODULE] = {};
    const s = extension_settings[MODULE];
    for (const k in defaults) if (s[k] === undefined) s[k] = JSON.parse(JSON.stringify(defaults[k]));
    if (!['scene', 'random', 'st'].includes(s.bg)) s.bg = 'scene';
    if (!['full', 'calm'].includes(s.motion)) s.motion = 'full';
    if (!['', 'en', 'ru'].includes(s.language)) s.language = '';
    if (!/^#[0-9a-f]{6}$/i.test(String(s.accent))) s.accent = defaults.accent;
    s.sound = s.sound !== false;
    s.volume = Math.max(0, Math.min(100, Math.round(Number(s.volume)))) || (Number(s.volume) === 0 ? 0 : 40);
    if (!s.snaps || typeof s.snaps !== 'object' || Array.isArray(s.snaps)) s.snaps = {};
    if (!s.seen || typeof s.seen !== 'object' || Array.isArray(s.seen)) s.seen = {};
    s.hidden = Array.isArray(s.hidden) ? s.hidden.filter(k => typeof k === 'string' && /^[cg]:/.test(k)).slice(0, 5000) : [];
    s.showcase = Array.isArray(s.showcase) ? s.showcase.filter(k => typeof k === 'string').slice(0, 200) : [];
    settings = s;
}
function save() { saveSettingsDebounced(); }

/* ============================================================ SMALL HELPERS */
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
const nkey = n => String(n || '').trim().toLowerCase().replace(/ё/g, 'е');
function same(a, b) {
    a = nkey(a); b = nkey(b);
    if (!a || !b) return false;
    if (a === b) return true;
    const fa = a.split(/[\s(,]/)[0], fb = b.split(/[\s(,]/)[0];
    return (fa === b) || (fb === a);
}
function findKey(obj, name) {
    if (!obj || typeof obj !== 'object') return null;
    return Object.keys(obj).find(k => same(k, name)) || null;
}
/* A message as plain words: no HTML, no markdown marks, no think blocks. */
function plain(text) {
    return String(text || '')
        .replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/<[^>]{0,400}>/g, ' ')
        .replace(/[*_~`#]+/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .trim();
}
/* What the sprite says: the quoted speech of the last reply, or its first sentences. */
function speechLines(text) {
    const s = plain(text).slice(0, 4000);
    if (!s) return [];
    const quotes = [];
    const re = /«([^»]{2,400})»|“([^”]{2,400})”|"([^"\n]{2,400})"/g;
    let m;
    while ((m = re.exec(s)) && quotes.length < 6) {
        const q = (m[1] || m[2] || m[3] || '').trim();
        if (q.length > 1) quotes.push(clip(q, 220));
    }
    if (quotes.length) return quotes;
    const parts = s.replace(/\n+/g, ' ').split(/(?<=[.!?…])\s+/).filter(Boolean);
    const out = [];
    let cur = '';
    for (const p of parts) {
        if ((cur + ' ' + p).trim().length > 170 && cur) { out.push(cur.trim()); cur = p; } else cur = (cur + ' ' + p).trim();
        if (out.length >= 5) break;
    }
    if (cur && out.length < 5) out.push(cur.trim());
    return out.map(x => clip(x, 220));
}
/* Only pictures we can trust go into src: this site, https, or an image data URL. */
function safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(u)) return u;
    if (/^blob:/i.test(u)) return u;
    try {
        const x = new URL(u, location.href);
        if (x.origin === location.origin) return x.href;
        if (x.protocol === 'https:') return x.href;
    } catch (e) { /* not a URL */ }
    return '';
}
const avatarUrl = file => file ? `/characters/${encodeURIComponent(file)}` : '';
const thumbUrl = file => file ? `/thumbnail?type=avatar&file=${encodeURIComponent(file)}` : '';
/* the ticket stub is narrow: a short count */
function msgs(n) { return lang() === 'ru' ? `${n} сообщ.` : `${n} msg`; }
/* {{char}} and {{user}} in card text shown to a person (never in what is sent to the model) */
function macros(text, charName) {
    let s0 = String(text || '');
    if (s0.indexOf('{{') === -1) return s0;
    let user = 'User';
    try { user = getContext().name1 || 'User'; } catch (e) { /* ignore */ }
    return s0.replace(/\{\{char\}\}/gi, () => charName || '').replace(/\{\{user\}\}/gi, () => user);
}
/* a long name gets smaller instead of running over everything below it */
function nameFit(name) {
    const n = String(name || '').length;
    return `font-size:${n <= 12 ? 46 : n <= 20 ? 38 : n <= 32 ? 30 : 24}px`;
}
function fmtDate(ms) {
    const n = Number(ms);
    if (!n) return '';
    try { return new Date(n).toLocaleDateString(lang() === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short' }); } catch (e) { return ''; }
}

/* ============================================================ WHAT THE SUITE KEEPS */
/* Installed means a folder SillyTavern found, not a settings key: settings outlive a deleted
   extension. The folder list is read once (it only changes with a reload). */
const SUITE = { map: /\brpg[\s_-]*map\b/i, diary: /\brpg[\s_-]*diary\b/i, phone: /\brpg[\s_-]*phone\b/i, dungeons: /\brpg[\s_-]*dungeons?\b/i };
const SUITE_KEY = { rpg_map_engine: 'map', rpg_diary: 'diary', rpg_phone: 'phone', rpg_dungeons: 'dungeons' };
let suiteFound = null;
function suiteExt(kind) {
    if (!suiteFound) {
        const names = stExtensions.extensionNames;
        if (!Array.isArray(names) || !names.length) return undefined;   // not loaded yet: unknown
        suiteFound = {};
        names.forEach(n => {
            const short = String(n).replace(/^third-party\//, '');
            let dn = '';
            try { const mf = typeof stExtensions.getExtensionManifest === 'function' ? stExtensions.getExtensionManifest(n) : null; dn = mf && mf.display_name ? String(mf.display_name) : ''; } catch (e) { /* no manifest */ }
            Object.keys(SUITE).forEach(k => { if (!suiteFound[k] && (SUITE[k].test(dn) || SUITE[k].test(short.replace(/[-_]+/g, ' ')))) suiteFound[k] = n; });
        });
    }
    return suiteFound[kind] || null;
}
function installed(kind, fallback) {
    const f = suiteExt(kind);
    return f === undefined ? fallback() : !!f;
}
const hasMap = () => installed('map', () => !!(extension_settings.rpg_map_engine || (window.RPG && window.RPG.map)));
const hasDiary = () => installed('diary', () => !!(extension_settings.rpg_diary || (window.RPG && window.RPG.diary)));
const hasPhone = () => installed('phone', () => !!(extension_settings.rpg_phone || document.getElementById('rph-btn')));
const hasDungeons = () => installed('dungeons', () => !!(extension_settings.rpg_dungeons || (window.RPG && window.RPG.dungeons)));
/* The rabbit hole is a dream per character, kept under their name. Read-only, as the rest. */
function dungeonsOf(name) {
    if (!hasDungeons()) return null;
    try {
        const live = window.RPG && window.RPG.dungeons && typeof window.RPG.dungeons.getProfile === 'function' ? window.RPG.dungeons.getProfile() : null;
        const ctx = getContext();
        if (live && ctx.characterId !== undefined && ctx.characters[ctx.characterId] && same(ctx.characters[ctx.characterId].name, name)) return live;
        const ps = extension_settings.rpg_dungeons && extension_settings.rpg_dungeons.profiles;
        const k = findKey(ps, name);
        return k && ps[k] && typeof ps[k] === 'object' ? ps[k] : null;
    } catch (e) { return null; }
}
/* a companion's portrait: inline, or kept by Dungeons in SillyTavern's localforage under a key */
async function dungeonsPicture(v) {
    v = String(v || '');
    if (v.startsWith('data:')) return safeUrl(v);
    if (!v.startsWith('rdg_img:')) return '';
    try {
        const lf = (window.SillyTavern && SillyTavern.libs && SillyTavern.libs.localforage) || window.localforage;
        const got = lf ? await lf.getItem(v) : null;
        return typeof got === 'string' ? safeUrl(got) : '';
    } catch (e) { return ''; }
}
/* installed, but switched off in its own settings */
const isOff = key => {
    if (extension_settings[key] && extension_settings[key].enabled === false) return true;
    const f = SUITE_KEY[key] ? suiteExt(SUITE_KEY[key]) : null;   // switched off in SillyTavern's extension manager
    return !!f && Array.isArray(extension_settings.disabledExtensions) && extension_settings.disabledExtensions.includes(f);
};
function mapStateOf(chatId) {
    if (!hasMap()) return null;   // what a removed extension left in the settings is not shown
    const s = extension_settings.rpg_map_engine;
    const ms = chatId && s && s.mapStates && s.mapStates[chatId];
    return ms && typeof ms === 'object' ? ms : null;
}
function diaryOf(chatId) {
    if (!hasDiary()) return null;
    const s = extension_settings.rpg_diary;
    const d = chatId && s && s.chatStates && s.chatStates[chatId];
    return d && typeof d === 'object' ? d : null;
}
function phoneUnread() {
    if (!hasPhone()) return 0;
    const s = extension_settings.rpg_phone;
    if (!s || !s.unread || typeof s.unread !== 'object') return 0;
    return Object.values(s.unread).reduce((a, n) => a + (Number(n) > 0 ? Number(n) : 0), 0);
}
function roomsOf(ms) {
    const out = [];
    if (!ms || !Array.isArray(ms.maps)) return out;
    ms.maps.forEach(m => (m && Array.isArray(m.blocks) ? m.blocks : []).forEach(b => (b && Array.isArray(b.locations) ? b.locations : []).forEach(l => (l && Array.isArray(l.sublocs) ? l.sublocs : []).forEach(s => {
        if (s && s.name) out.push({ map: String(m.name || ''), mapId: m.id || null, block: String(b.name || ''), loc: String(l.name || ''), room: String(s.name), sub: s });
    }))));
    return out;
}
function hereRoom(ms) {
    const a = ms && ms.activeSubloc;
    if (!a || !a.name) return null;
    const all = roomsOf(ms);
    return all.find(r => r.room === a.name && (!ms.hereMap || r.mapId === ms.hereMap)) || all.find(r => r.room === a.name) || { room: String(a.name), block: '', loc: '', map: '', sub: a };
}
function whereOf(ms, name) {
    const wh = ms && ms.where;
    const k = findKey(wh, name);
    return k && wh[k] && wh[k].kind ? wh[k] : null;
}
function whereText(w) {
    if (!w) return '';
    if (w.kind === 'room') return [w.loc || w.block, w.room].filter(Boolean).map(String).join(' · ');
    if (w.kind === 'away') return String(w.text || t('away'));
    if (w.kind === 'you') return t('with_you');
    return '';
}
/* One line spent together shows once, with every name on it — as in the map's morning summary. */
function chronicleOf(ms, only) {
    const c = ms && ms.chronicle;
    if (!c || typeof c !== 'object') return [];
    const groups = new Map();
    let order = 0;
    Object.entries(c).forEach(([name, list]) => {
        if (!Array.isArray(list)) return;
        if (only && !same(name, only)) return;
        list.forEach(x => {
            if (!x || !x.text) return;
            const k = (x.at || '') + '|' + x.text;
            if (!groups.has(k)) groups.set(k, { at: Number(x.at) || 0, when: String(x.when || ''), text: String(x.text), names: [], n: order++ });
            const g = groups.get(k);
            if (!g.names.some(n => same(n, name))) g.names.push(name);
        });
    });
    return [...groups.values()].sort((a, b) => (b.at - a.at) || (b.n - a.n));
}
function heardOf(ms) {
    return (ms && Array.isArray(ms.overheard) ? ms.overheard : []).filter(o => o && !o.forgotten && (o.kind === 'door' || o.kind === 'letter'));
}
function routineOf(ms, name) {
    const r = ms && ms.routine;
    const k = findKey(r, name);
    return k ? r[k] : null;
}
function slotText(s) {
    if (!s || !s.kind) return '';
    return s.kind === 'room' ? [s.loc || s.block, s.room].filter(Boolean).map(String).join(' · ') : String(s.text || '');
}
function npcOf(dy, name) {
    return dy && Array.isArray(dy.npcs) ? dy.npcs.find(n => n && same(n.name, name)) || null : null;
}

/* room pictures: a URL, a file from the backgrounds folder, or a picture the map keeps in IndexedDB */
const idbCache = new Map();
/* Never create the map's database: opening one that does not exist would make an empty
   version 1, and the map could then never add its picture store. So look first. */
async function mapDbExists() {
    try {
        if (!indexedDB || typeof indexedDB.databases !== 'function') return false;
        const list = await indexedDB.databases();
        return Array.isArray(list) && list.some(d => d && d.name === 'rpgMapImages');
    } catch (e) { return false; }
}
async function idbImage(key) {
    if (idbCache.has(key)) return idbCache.get(key);
    if (!(await mapDbExists())) return '';
    return new Promise(resolve => {
        let req;
        const done = v => { idbCache.set(key, v); if (idbCache.size > 10) idbCache.delete(idbCache.keys().next().value); resolve(v); };
        try { req = indexedDB.open('rpgMapImages'); } catch (e) { resolve(''); return; }
        // it vanished between the check and here: do not create it — that is the map's job
        req.onupgradeneeded = () => { try { req.transaction.abort(); } catch (e) { /* ignore */ } };
        req.onerror = () => resolve('');
        req.onblocked = () => resolve('');
        req.onsuccess = () => {
            const db = req.result;
            try {
                if (!db.objectStoreNames.contains('imgs')) { db.close(); resolve(''); return; }
                const rq = db.transaction('imgs', 'readonly').objectStore('imgs').get(key);
                rq.onsuccess = () => { db.close(); done(safeUrl(typeof rq.result === 'string' ? rq.result : '')); };
                rq.onerror = () => { db.close(); resolve(''); };
            } catch (e) { try { db.close(); } catch (x) { /* ignore */ } resolve(''); }
        };
    });
}
const hasPicture = sub => !!(sub && ((typeof sub.image === 'string' && sub.image) || (typeof sub.bgFile === 'string' && sub.bgFile)));
async function roomPicture(sub) {
    if (!sub) return '';
    if (typeof sub.image === 'string' && sub.image) {
        if (sub.image.startsWith('idb:')) { const v = await idbImage(sub.image.slice(4)); if (v) return v; }
        else { const v = safeUrl(sub.image); if (v) return v; }
    }
    if (typeof sub.bgFile === 'string' && sub.bgFile) return safeUrl('backgrounds/' + encodeURIComponent(sub.bgFile));
    return '';
}
function chatBackground() {
    try {
        const el = document.getElementById('bg1') || document.getElementById('bg_custom');
        const m = el && getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
        return m ? safeUrl(m[1]) : '';
    } catch (e) { return ''; }
}

/* sprites — the same folder SillyTavern's Character Expressions uses. A different one each
   time, but never a sad, angry or otherwise unhappy face: the menu greets you. */
const SAD_FACES = ['anger', 'annoyance', 'disappointment', 'disapproval', 'disgust', 'embarrassment', 'fear', 'grief', 'nervousness', 'remorse', 'sadness', 'confusion'];
const spriteCache = new Map();
async function spritesOf(ch) {
    if (!ch || !ch.name) return [];
    const file = String(ch.avatar || '').replace(/\.[^.]+$/, '');
    const ov = Array.isArray(extension_settings.expressionOverrides) ? extension_settings.expressionOverrides.find(e => e && e.name === file) : null;
    const folder = (ov && ov.path) || ch.name;
    if (spriteCache.has(folder)) return spriteCache.get(folder);
    let out = [];
    try {
        const r = await fetch('/api/sprites/get?name=' + encodeURIComponent(folder), { headers: getRequestHeaders() });
        if (r.ok) {
            const list = await r.json();
            if (Array.isArray(list)) {
                const all = list.filter(x => x && x.path).map(x => ({ label: String(x.label || '').toLowerCase(), url: safeUrl(x.path) })).filter(x => x.url);
                const kind = all.filter(x => !SAD_FACES.includes(x.label));
                out = kind.length ? kind : all.filter(x => x.label === 'neutral');
            }
        }
    } catch (e) { /* no sprites */ }
    spriteCache.set(folder, out);
    return out;
}
function pickSprite(list, not) {
    if (!list || !list.length) return '';
    const pool = list.length > 1 ? list.filter(x => x.url !== not) : list;
    return pool[Math.floor(Math.random() * pool.length)].url;
}
async function spriteOf(ch) { return pickSprite(await spritesOf(ch)); }

/* recent chats: SillyTavern's own list, or the characters' last chats on an older version */
let recentCache = { at: 0, list: [] };
async function recentChats(force) {
    if (!force && Date.now() - recentCache.at < 15000) return recentCache.list;
    const ctx = getContext();
    const chars = ctx.characters || [], groups = ctx.groups || [];
    let list = [];
    try {
        const r = await fetch('/api/chats/recent', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ max: 24 }), cache: 'no-cache' });
        const d = r.ok ? await r.json() : null;
        if (Array.isArray(d)) list = d.filter(x => x && x.file_id && (x.group ? groups.some(g => g.id === x.group) : chars.some(c => c.avatar === x.avatar)))
            .map(x => ({ file_id: String(x.file_id), avatar: x.avatar || null, group: x.group || null, mes: String(x.mes || ''), last: Number(x.last_mes) || 0, items: Number(x.chat_items) || 0 }));
    } catch (e) { /* older SillyTavern */ }
    if (!list.length) {
        list = chars.filter(c => c && c.chat).map(c => ({ file_id: String(c.chat), avatar: c.avatar, group: null, mes: '', last: Number(c.date_last_chat) || 0, items: 0 }))
            .concat(groups.filter(g => g && g.chat_id).map(g => ({ file_id: String(g.chat_id), avatar: null, group: g.id, mes: '', last: Number(g.date_last_chat) || 0, items: 0 })))
            .sort((a, b) => b.last - a.last).slice(0, 24);
    }
    recentCache = { at: Date.now(), list };
    return list;
}
function entityOf(rec) {
    const ctx = getContext();
    if (!rec) return null;
    if (rec.group) {
        const g = (ctx.groups || []).find(x => x.id === rec.group);
        return g ? { kind: 'group', g } : null;
    }
    const idx = (ctx.characters || []).findIndex(c => c.avatar === rec.avatar);
    return idx >= 0 ? { kind: 'char', ch: ctx.characters[idx], idx } : null;
}
/* the picture a group was given in SillyTavern (the same test SillyTavern uses) */
function groupPicture(g) {
    const u = g && typeof g.avatar_url === 'string' ? g.avatar_url : '';
    if (!u || !(/^data:image\//i.test(u) || u.startsWith('user') || u.startsWith('/user'))) return '';
    return safeUrl(u);
}
function membersOf(g) {
    const chars = getContext().characters || [];
    return (g && Array.isArray(g.members) ? g.members : []).map(m => chars.find(c => c.avatar === m || c.name === m)).filter(Boolean);
}
function liveEntity() {
    const ctx = getContext();
    if (!ctx.chatId) return null;
    if (ctx.groupId) { const g = (ctx.groups || []).find(x => x.id === ctx.groupId); return g ? { kind: 'group', g } : null; }
    const idx = Number(ctx.characterId);
    return ctx.characterId !== undefined && ctx.characters[idx] ? { kind: 'char', ch: ctx.characters[idx], idx } : null;
}
function sceneLive() {
    try {
        const sc = window.RPG && window.RPG.scene;
        const d = sc && sc.available && typeof sc.get === 'function' ? sc.get() : null;
        return d ? { date: d.date || '', time: d.time || '', weather: d.weather || '', location: d.location || '', day: d.day || null } : null;
    } catch (e) { return null; }
}

/* ============================================================ SNAPSHOTS
   With no chat open there is nothing to read the scene or the last line
   from, so the menu keeps a few words about each chat as it is played. */
function captureSnapshot() {
    try {
        if (!settings || !settings.enabled) return;
        const ctx = getContext();
        const id = ctx.chatId;
        if (!id) return;
        const chat = ctx.chat || [];
        let last = null;
        for (let i = chat.length - 1; i >= 0 && i >= chat.length - 40; i--) {
            const m = chat[i];
            if (m && !m.is_user && !m.is_system && m.mes) { last = m; break; }
        }
        const ent = liveEntity();
        const sc = sceneLive();
        const prev = settings.snaps[id] || {};
        const snap = {
            at: Date.now(),
            group: ctx.groupId || null,
            avatar: ent && ent.kind === 'char' ? ent.ch.avatar : null,
            speaker: last ? String(last.name || '') : (prev.speaker || ''),
            speakerAvatar: last ? String(last.original_avatar || (ent && ent.kind === 'char' ? ent.ch.avatar : '') || '') : (prev.speakerAvatar || ''),
            line: last ? clip(plain(last.mes), 1500) : (prev.line || ''),
            items: chat.length,
            scene: sc || prev.scene || null,
        };
        settings.snaps[id] = snap;
        const keys = Object.keys(settings.snaps);
        if (keys.length > SNAP_MAX) keys.sort((a, b) => (settings.snaps[a].at || 0) - (settings.snaps[b].at || 0)).slice(0, keys.length - SNAP_MAX).forEach(k => delete settings.snaps[k]);
        save();
    } catch (e) { console.warn('[Tavern Suite Menu] snapshot', e); }
}
let snapTimer = 0;
function snapSoon() { clearTimeout(snapTimer); snapTimer = setTimeout(captureSnapshot, 1200); }

/* ============================================================ OPENING THINGS */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 4000) {
    const end = Date.now() + ms;
    while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch (e) { /* keep waiting */ } await sleep(80); }
    return null;
}
async function openEntity(ent) {
    const ctx = getContext();
    if (!ent) return false;
    if (ent.kind === 'group') { await openGroupById(ent.g.id); return true; }
    const idx = (ctx.characters || []).findIndex(c => c.avatar === ent.ch.avatar);
    if (idx < 0) return false;
    await ctx.selectCharacterById(idx);
    return true;
}
/* make the given chat the open one — as SillyTavern's own “recent chats” does it */
async function ensureChat(chatId, ent) {
    const ctx = getContext();
    if (chatId && ctx.chatId === chatId) return true;
    if (!ent) return false;
    try {
        await openEntity(ent);
        await waitFor(() => getContext().chatId, 5000);
        if (chatId && getContext().chatId !== chatId) {
            if (ent.kind === 'group') await getContext().openGroupChat(ent.g.id, chatId);
            else await getContext().openCharacterChat(chatId);
        }
        await waitFor(() => !chatId || getContext().chatId === chatId, 5000);
        await sleep(250);    // the suite's own CHAT_CHANGED handlers draw their buttons now
        return !!getContext().chatId;
    } catch (e) {
        console.warn('[Tavern Suite Menu] open chat', e);
        return false;
    }
}

/* ============================================================ SOUNDS
   Made in the browser, like the map's ambience: no files, nothing downloaded. */
let actx = null, noiseBuf = null;
function audioCtx() {
    try {
        if (!actx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; actx = new C(); }
        if (actx.state === 'suspended') actx.resume().catch(() => {});
        return actx;
    } catch (e) { return null; }
}
function sound(kind) {
    if (!settings || !settings.sound || !settings.volume) return;
    const a = audioCtx();
    if (!a) return;
    try {
        const now = a.currentTime;
        const out = a.createGain();
        out.gain.value = (settings.volume / 100) * 0.32;
        out.connect(a.destination);
        const tone = (f, t0, dur, type, g) => {
            const o = a.createOscillator(), e = a.createGain();
            o.type = type || 'sine'; o.frequency.setValueAtTime(f, now + t0);
            e.gain.setValueAtTime(0.0001, now + t0); e.gain.exponentialRampToValueAtTime(g || 0.5, now + t0 + 0.008); e.gain.exponentialRampToValueAtTime(0.0001, now + t0 + dur);
            o.connect(e); e.connect(out); o.start(now + t0); o.stop(now + t0 + dur + 0.03);
        };
        const noise = (t0, dur, freq, q, g) => {
            if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
            const src = a.createBufferSource(), f = a.createBiquadFilter(), e = a.createGain();
            src.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.setValueAtTime(freq, now + t0); f.frequency.exponentialRampToValueAtTime(freq * 1.8, now + t0 + dur); f.Q.value = q;
            e.gain.setValueAtTime(0.0001, now + t0); e.gain.exponentialRampToValueAtTime(g, now + t0 + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, now + t0 + dur);
            src.connect(f); f.connect(e); e.connect(out); src.start(now + t0); src.stop(now + t0 + dur + 0.03);
        };
        if (kind === 'select') { tone(1320, 0, 0.09, 'triangle', 0.45); tone(1980, 0.02, 0.14, 'sine', 0.22); }
        else if (kind === 'deal') noise(0, 0.13, 2200, 0.9, 0.8);
        else if (kind === 'page') { noise(0, 0.24, 900, 0.6, 0.55); noise(0.09, 0.2, 2600, 0.7, 0.3); }
        else if (kind === 'seal') { tone(105, 0, 0.3, 'sine', 0.9); noise(0, 0.09, 500, 1, 0.6); tone(210, 0.02, 0.2, 'triangle', 0.25); }
        else if (kind === 'open') [660, 880, 1320].forEach((f, i) => tone(f, i * 0.07, 0.55, 'sine', 0.3));
        else if (kind === 'rip') { noise(0, 0.08, 2800, 0.5, 0.9); noise(0.06, 0.12, 3600, 0.4, 0.8); noise(0.16, 0.16, 2200, 0.6, 0.6); }
        else if (kind === 'back') { tone(880, 0, 0.08, 'triangle', 0.3); tone(620, 0.05, 0.12, 'triangle', 0.26); }
        else if (kind === 'close') [990, 740, 550].forEach((f, i) => tone(f, i * 0.06, 0.4, 'sine', 0.22));
        setTimeout(() => { try { out.disconnect(); } catch (e) { /* ignore */ } }, 1500);
    } catch (e) { /* no sound is fine */ }
}
const SOUND_OF = {
    select: ['tab', 'sel', 'tag-pick', 'm-room', 'm-map', 'd-tab', 'gsel', 'y-pick', 'sort-toggle', 'week', 'talk', 'pop', 'ds-bg', 'tag-assign', 'tag-color', 'ce-fav', 'ce-edit', 'ce-role', 'ce-depth', 'ce-g-del', 'y-def', 'y-pos', 'y-role', 'y-depth', 'y-lore-set', 'hide', 'showcase', 'showcase-clear', 'h-tab'],
    deal: ['ge-toggle', 'deck', 'new-group', 'edit-group', 'page', 'goto', 'ge-page', 'y-page', 'p-zoom'],
    page: ['ce-open', 'ce-close', 'y-open', 'y-close', 'ce-g-add', 'chronicle', 'heard', 'calendar', 'gifts', 'recent', 'rooms', 'diary', 'map', 'persona', 'd-page', 'dossier', 'open-dossier', 'open-group', 'pp', 'pp-go'],
    seal: ['h-open', 'dungeons', 'ge-save', 'start', 'open-recent', 'y-save', 'tag-new', 'tag-save', 'ce-save'],
    back: ['home', 'party-back', 'panel-close', 'ce-back', 'h-close'],
    close: ['close'],
};
const soundFor = act => Object.keys(SOUND_OF).find(k => SOUND_OF[k].includes(act)) || '';

/* ============================================================ STATE */
let host = null, root = null, hubEl = null, stageEl = null, backEl = null;
let isOpen = false;
let model = null;
let building = 0;
const view = {
    screen: 'main', panel: null, line: 0, bgOverride: null,
    deck: { tab: 'all', tag: '', q: '', sort: 'recent', page: 0, sel: null },
    dossier: null, week: false, group: null, gsel: null,
    ge: null,   // group editor: { id | null, name, members: [avatar], del, page, q, tag }
    partyFrom: 'deck',
    dpics: [],                              // dossier: the rooms behind
    dtab: 'entries', dpage: 0, dturn: 0,    // diary page
    mmap: null, mroom: null,                // map page
    pp: 0, pzoom: null,                     // panels: the page, the calendar leaf held up
    ypage: 0, yview: null, yedit: null,     // persona page: the face looked at, the form
    tagEdit: null, deckEnt: null,
    ce: null, ceFrom: 'deck',               // character editor           // tags: the one being edited, the card they go on
    pop: null,  // an open tag list: 'tags' (deck) | 'ge-tags' (party)
};

/* ============================================================ ICONS */
const SUIT = {
    spade: 'M12 2s8 7 8 12a4 4 0 0 1-7 2.6L14 22h-4l1-5.4A4 4 0 0 1 4 14c0-5 8-12 8-12z',
    heart: 'M12 21s-8-5.2-8-11.2A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.8C20 15.8 12 21 12 21z',
    club: 'M12 3a3.6 3.6 0 0 1 3.4 4.8A3.6 3.6 0 1 1 13 14l1 7h-4l1-7a3.6 3.6 0 1 1-2.4-6.2A3.6 3.6 0 0 1 12 3z',
    diamond: 'M12 2l7 10-7 10-7-10z',
};
const SUITS = ['spade', 'heart', 'club', 'diamond'];
const RANKS = ['K', 'Q', 'J', 'A'];
const ico = (d, size = 24, stroke = '#e9dfcc', sw = 1.6) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${sw}" aria-hidden="true">${d}</svg>`;
const I = {
    clock: '<circle cx="12" cy="13" r="8"></circle><path d="M12 13V9M12 13l3 2M10 2h4M12 2v3"></path>',
    mail: '<rect x="3" y="6" width="18" height="13" rx="1.5"></rect><path d="M3 7l9 6 9-6"></path>',
    key: '<circle cx="8" cy="15" r="4"></circle><path d="M11 12l9-9M17 6l3 3M15 8l2 2"></path>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"></rect><path d="M11 18h2"></path>',
    gear: '<circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"></path>',
    x: '<path d="M6 6l12 12M18 6L6 18"></path>',
    scroll: '<path d="M5 4h11l3 3v13H5z M9 9h7M9 13h7M9 17h4"></path>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="1"></rect><path d="M3 10h18M8 3v4M16 3v4"></path>',
    ear: '<path d="M7 10a5 5 0 0 1 10 0c0 3-3 3-3 6a2 2 0 0 1-4 0M5 9a7 7 0 0 1 3-5"></path>',
    gift: '<rect x="4" y="8" width="16" height="13" rx="1"></rect><path d="M12 8v13M4 12h16M12 8c-2-4-6-4-6-1s4 1 6 1c2 0 6 2 6-1s-4-3-6 1"></path>',
    star: '<path d="M12 2l3 7h7l-5.5 4.5 2 7.5L12 17l-6.5 4 2-7.5L2 9h7z"></path>',
    cards: '<rect x="3" y="4" width="8" height="12" rx="1" transform="rotate(-8 7 10)"></rect><rect x="12" y="6" width="8" height="12" rx="1" transform="rotate(8 16 12)"></rect>',
    frame: '<rect x="4" y="4" width="16" height="16" rx="1"></rect><path d="M4 16l5-5 4 4 3-3 4 4"></path><circle cx="15" cy="9" r="1.6"></circle>',
    user: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21c1-5 4-7 8-7s7 2 8 7"></path>',
    left: '<path d="M15 5l-7 7 7 7"></path>',
    right: '<path d="M9 5l7 7-7 7"></path>',
    imp: '<path d="M12 3v12M7 10l5 5 5-5M4 19h16"></path>',
    plus: '<path d="M12 5v14M5 12h14"></path>',
    group: '<circle cx="9" cy="8" r="3.2"></circle><path d="M3 20c.6-4 3-6 6-6s5.4 2 6 6"></path><circle cx="17" cy="9" r="2.4"></circle><path d="M16 14.2c2.6.2 4.4 2 5 5.3"></path>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z M13 7l4 4"></path>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>',
    eyeDim: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" stroke-dasharray="3 3"></path><circle cx="12" cy="12" r="3"></circle>',
    eyeOff: '<path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.1 7.4C3.6 9.2 2 12 2 12s4 6 10 6a9.6 9.6 0 0 0 4.3-1"></path><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"></path><circle cx="7.5" cy="8.5" r="1.5"></circle>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"></rect><circle cx="9" cy="9" r="1.3"></circle><circle cx="15" cy="15" r="1.3"></circle><circle cx="15" cy="9" r="1.3"></circle><circle cx="9" cy="15" r="1.3"></circle>',
};
const RABBIT = `<svg width="64" height="64" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="9" cy="6.6" rx="2" ry="5.2" fill="#ece0c6" transform="rotate(-13 9 6.6)"></ellipse><ellipse cx="15" cy="6.6" rx="2" ry="5.2" fill="#ece0c6" transform="rotate(13 15 6.6)"></ellipse><ellipse cx="9" cy="6.8" rx=".9" ry="3.6" fill="#c03a4b" transform="rotate(-13 9 6.8)"></ellipse><ellipse cx="15" cy="6.8" rx=".9" ry="3.6" fill="#c03a4b" transform="rotate(13 15 6.8)"></ellipse><circle cx="12" cy="14.5" r="5.6" fill="#ece0c6"></circle><circle cx="10" cy="13.8" r=".8" fill="#2a1d18"></circle><circle cx="14" cy="13.8" r=".8" fill="#2a1d18"></circle><path d="M11.3 15.8h1.4l-.7.8z" fill="#c03a4b"></path></svg>`;
const GEM = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l7 10-7 10-7-10z" fill="#8f1d2c"></path></svg>';
const SPARK = s => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0l2.5 9.5L24 12l-9.5 2.5L12 24l-2.5-9.5L0 12l9.5-2.5z" fill="#e8c882"></path></svg>`;
const suitSvg = (k, size, fill) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="${SUIT[k]}" fill="${fill}"></path></svg>`;
const HEART_ON = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="' + SUIT.heart + '" fill="#c03a4b"></path></svg>';
const HEART_OFF = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c6a15b" stroke-width="1.6" aria-hidden="true"><path d="' + SUIT.heart + '"></path></svg>';
const SILHOUETTE = `<svg width="140" height="200" viewBox="0 0 220 300" fill="none" stroke="#e9dfcc" stroke-opacity="0.3" stroke-width="3" aria-hidden="true" style="position:absolute;left:50%;bottom:70px;margin-left:-70px"><circle cx="110" cy="78" r="46"></circle><path d="M30 300 C30 200 60 150 110 150 C160 150 190 200 190 300"></path></svg>`;
const img = (src, cls = '', alt = '') => src ? `<img ${cls ? `class="${cls}" ` : ''}src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" draggable="false">` : '';

/* ============================================================ HOST (shadow DOM) */
let cssText = '';
async function ensureHost() {
    if (host) return;
    if (!cssText) {
        try { const r = await fetch(BASE + 'hub.css', { cache: 'no-cache' }); cssText = r.ok ? await r.text() : ''; } catch (e) { cssText = ''; }
    }
    host = document.createElement('div');
    host.id = 'rpg-hub-host';
    document.body.appendChild(host);
    root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = cssText;
    root.appendChild(style);
    hubEl = document.createElement('div');
    hubEl.className = 'hub';
    hubEl.setAttribute('role', 'dialog');
    hubEl.setAttribute('aria-modal', 'true');
    hubEl.setAttribute('aria-label', 'Tavern Suite Menu');
    hubEl.tabIndex = -1;
    hubEl.innerHTML = `
        <div class="hub-backdrop"><div class="hub-bgart">${BG_ART}</div><img class="hub-bgimg" alt="" draggable="false"></div>
        <div class="hub-shade"></div>
        <div class="hub-fog"></div><div class="hub-fog2"></div>
        ${FALLING}
        <div class="hub-stage"></div>`;
    root.appendChild(hubEl);
    stageEl = hubEl.querySelector('.hub-stage');
    backEl = hubEl.querySelector('.hub-backdrop');
    hubEl.addEventListener('click', onClick);
    hubEl.addEventListener('input', onInput);
    hubEl.addEventListener('change', e => {
        const el = e.target;
        const which = el && el.getAttribute('data-act');
        const target = which === 'y-file' ? ensureYEdit() : which === 'ce-file' ? view.ce : null;
        if (!target) return;
        const f = el.files && el.files[0];
        if (!f) return;
        if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type) || f.size > 10 * 1024 * 1024) { toast(t('you_bad_pic')); return; }
        const rd = new FileReader();
        rd.onload = () => { if (target !== view.yedit && target !== view.ce) return; target.file = f; target.preview = safeUrl(String(rd.result || '')); render(); };
        rd.readAsDataURL(f);
    });
    // Enter in a small field does what its button does
    hubEl.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
        const go = { 'tag-new-name': 'tag-new', 'tag-name': 'tag-save' }[act];
        if (!go) return;
        e.preventDefault();
        const b = e.target.closest('.hub-pop') && e.target.closest('.hub-pop').querySelector(`[data-act="${go}"]`);
        if (b) b.click();
    });
    hubEl.addEventListener('mousemove', onMove);
    hubEl.addEventListener('mouseleave', () => parallax(0, 0));
    // a field getting focus scrolls its container in some browsers: undo it at once
    const unscroll = el => el.addEventListener('scroll', () => { if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0; } });
    unscroll(hubEl); unscroll(stageEl);
    window.addEventListener('resize', fit);
}
const BG_ART = `<svg viewBox="0 0 1520 980" fill="none" aria-hidden="true">
    <defs><radialGradient id="hbMoon" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#f3e6c8" stop-opacity="0.9"></stop><stop offset="60%" stop-color="#c6a15b" stop-opacity="0.18"></stop><stop offset="100%" stop-color="#c6a15b" stop-opacity="0"></stop></radialGradient>
    <pattern id="hbCheck" width="80" height="80" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#1b1418"></rect><rect x="40" y="40" width="40" height="40" fill="#1b1418"></rect></pattern></defs>
    <circle cx="930" cy="230" r="230" fill="url(#hbMoon)"></circle>
    <path d="M560 760 V300 Q560 150 700 150 Q840 150 840 300 V760" stroke="#c6a15b" stroke-opacity="0.22" stroke-width="3"></path>
    <path d="M600 760 V310 Q600 190 700 190 Q800 190 800 310 V760" stroke="#c6a15b" stroke-opacity="0.12" stroke-width="2"></path>
    <path d="M700 190 V760 M600 420 H800 M600 600 H800" stroke="#c6a15b" stroke-opacity="0.12" stroke-width="2"></path>
    <path d="M1010 760 V330 Q1010 190 1140 190 Q1270 190 1270 330 V760" stroke="#c6a15b" stroke-opacity="0.18" stroke-width="3"></path>
    <path d="M1140 190 V760 M1010 450 H1270" stroke="#c6a15b" stroke-opacity="0.1" stroke-width="2"></path>
    <path d="M0 760 L1520 760 L1520 980 L0 980 Z" fill="url(#hbCheck)" opacity="0.9"></path>
    <path d="M0 760 L1520 760" stroke="#c6a15b" stroke-opacity="0.25"></path></svg>`;
const FALLING = [
    ['15%', 17, -3, `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="${SUIT.heart}" fill="#8f1d2c"></path></svg>`],
    ['52%', 22, -9, `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="${SUIT.spade}" fill="#c6a15b" fill-opacity="0.7"></path></svg>`],
    ['70%', 19, -14, `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="${SUIT.diamond}" fill="#8f1d2c" fill-opacity="0.85"></path></svg>`],
    ['29%', 25, -6, `<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="#e9dfcc" fill-opacity="0.5"></circle></svg>`],
    ['90%', 21, -1, `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="${SUIT.heart}" fill="#8f1d2c"></path></svg>`],
].map(([l, d, dl, s]) => `<div class="hub-fall" style="left:${l};animation-duration:${d}s;animation-delay:${dl}s">${s}</div>`).join('');

function fit() {
    if (!stageEl) return;
    const k = Math.min(window.innerWidth / 1440, window.innerHeight / 900);
    stageEl.style.transform = `translate(-50%, -50%) scale(${k.toFixed(4)})`;
}
let pRaf = 0, pX = 0, pY = 0, actorEl = null;
function onMove(e) {
    if (settings.motion === 'calm' || view.screen !== 'main') return;
    pX = e.clientX / window.innerWidth - 0.5; pY = e.clientY / window.innerHeight - 0.5;
    if (pRaf) return;
    pRaf = requestAnimationFrame(() => { pRaf = 0; parallax(pX, pY); });
}
function parallax(x, y) {
    if (backEl) backEl.style.transform = `translate(${(x * -18).toFixed(1)}px, ${(y * -10).toFixed(1)}px)`;
    const a = actorEl && actorEl.isConnected ? actorEl : null;
    if (a) a.style.transform = `translate(${(x * 14).toFixed(1)}px, ${(y * 6).toFixed(1)}px)`;
}
function setBackground(url) {
    const im = hubEl && hubEl.querySelector('.hub-bgimg');
    if (!im) return;
    if (!url) { im.classList.remove('on'); im.removeAttribute('src'); return; }
    if (im.getAttribute('src') === url) { im.classList.add('on'); return; }
    im.classList.remove('on');
    im.onload = () => im.classList.add('on');
    im.onerror = () => im.classList.remove('on');
    im.src = url;
}

/* ============================================================ OPEN / CLOSE */
let lastFocus = null;
async function openHub(screen) {
    if (!settings.enabled) return;
    await ensureHost();
    if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = 0; hubEl.classList.remove('leaving'); }
    lastFocus = document.activeElement;
    view.panel = null;
    view.screen = screen || 'main';
    hubEl.classList.toggle('calm', settings.motion === 'calm');
    hubEl.style.setProperty('--accent', settings.accent);
    host.classList.add('rpg-hub-open');
    document.body.classList.add('rpg-hub-lock');
    isOpen = true;
    window.addEventListener('keydown', onKey, true);
    fit();
    hubEl.focus({ preventScroll: true });
    sound('open');
    await refresh(true);
}
/* the menu does not vanish: it dissolves (instantly with calm motion) */
let leaveTimer = 0;
function closeHub() {
    if (!host || !isOpen) return Promise.resolve();
    lastScreen = '';
    isOpen = false;
    window.removeEventListener('keydown', onKey, true);
    phoneMode(false);
    view.panel = null; view.pop = null;
    if (pRaf) { cancelAnimationFrame(pRaf); pRaf = 0; }
    const calm = settings.motion === 'calm' || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    return new Promise(resolve => {
        const done = () => {
            leaveTimer = 0;
            hubEl.classList.remove('leaving');
            host.classList.remove('rpg-hub-open');
            document.body.classList.remove('rpg-hub-lock');
            try { if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
            resolve();
        };
        if (calm) { done(); return; }
        hubEl.classList.add('leaving');
        clearTimeout(leaveTimer);
        leaveTimer = setTimeout(done, 380);
    });
}
/* The phone over the menu: its own layers are lifted above the menu while the menu is up,
   so it opens in place instead of taking you back to the chat. */
function phoneMode(on) {
    document.body.classList.toggle('rpg-hub-phone', !!on);
    if (!on) document.body.classList.remove('rpg-hub-dng');
}
async function refresh(rebuild) {
    if (!isOpen) return;
    if (rebuild || !model) {
        const my = ++building;
        const m = await buildModel();
        if (my !== building) return;   // a newer build started meanwhile
        model = m;
    }
    render();
}

/* ============================================================ MODEL (main menu) */
async function buildModel() {
    const ctx = getContext();
    let chatId = ctx.chatId || null;
    let ent = liveEntity();
    const live = !!(chatId && ent);
    if (live) captureSnapshot();
    const rec = await recentChats(!live);
    let recMes = '', recItems = 0;
    if (!live) {
        const r = rec.find(recShown);
        if (r) { chatId = r.file_id; ent = entityOf(r); recMes = r.mes; recItems = r.items; }
        else { chatId = null; ent = null; }
    }
    const snap = chatId ? settings.snaps[chatId] || null : null;
    const ms = mapStateOf(chatId), dy = diaryOf(chatId);
    let focus = ent && ent.kind === 'char' ? ent.ch : null;
    if (ent && ent.kind === 'group') {
        const mem = membersOf(ent.g);
        focus = mem.find(c => snap && (c.avatar === snap.speakerAvatar || same(c.name, snap.speaker))) || mem[0] || null;
    }
    const scene = (live ? sceneLive() : null) || (snap && snap.scene) || null;
    const here = hereRoom(ms);
    const line = (snap && snap.line) || plain(recMes);
    const lines = speechLines(line);
    const speaker = (snap && snap.speaker) || (focus && focus.name) || '';
    const sprites = focus ? await spritesOf(focus) : [];
    const sprite = pickSprite(sprites);
    // the background
    let bg = null;
    if (view.bgOverride) bg = view.bgOverride;
    else if (settings.bg !== 'st') {
        const pics = roomsOf(ms).filter(r => hasPicture(r.sub));
        let pick = settings.bg === 'scene' && here && hasPicture(here.sub) ? here : null;
        if (!pick && pics.length) pick = pics[Math.floor(Math.random() * pics.length)];
        if (pick) { const u = await roomPicture(pick.sub); if (u) bg = { url: u, name: pick.room }; }
    }
    if (!bg) { const u = chatBackground(); if (u) bg = { url: u, name: '' }; }
    const npc = focus ? npcOf(dy, focus.name) : null;
    const chron = chronicleOf(ms);
    const heard = heardOf(ms);
    return {
        chatId, ent, live, snap, ms, dy, focus, scene, here, lines, speaker, sprite, sprites, bg, npc, chron, heard,
        items: (live ? (ctx.chat || []).length : 0) || (snap && snap.items) || recItems || 0,
        rec,
    };
}

/* ============================================================ RENDER */
let lastScreen = '';
let lastOverlay = '';
/* places that scroll inside the menu: kept across a redraw */
const SCROLL_AREAS = ['.fs-obody', '.ce-greets', '.hub-pop', '.hub-sheet .list', '.hub-mtree .list', '.cal-zoom .tx', '.hr-paper .fit', '.hr-scene .fit', 'textarea'];
function grabScroll() {
    const out = [];
    try {
        SCROLL_AREAS.forEach(sel => stageEl.querySelectorAll(sel).forEach((el, i) => { if (el.scrollTop > 0) out.push({ sel, i, top: el.scrollTop }); }));
    } catch (e) { /* never break a redraw */ }
    return out;
}
function restoreScroll(saved) {
    if (!saved.length) return;
    try { saved.forEach(x => { const el = stageEl.querySelectorAll(x.sel)[x.i]; if (el) el.scrollTop = x.top; }); } catch (e) { /* ignore */ }
}
const overlayKey = () => [view.pop || '', view.hopen || '', view.pzoom ?? '', (view.ce && view.ce.open) || '', (view.yedit && view.yedit.open) || ''].join('|');
const slideStart = Date.now();   // the deck tile's slideshow runs on one clock, whatever redraws
function render() {
    if (!stageEl) return;
    hubEl.style.setProperty('--accent', settings.accent);
    let html = '';
    if (view.screen === 'deck') html = renderDeck();
    else if (view.screen === 'dossier') html = renderDossier();
    else if (view.screen === 'group') html = renderGroup();
    else if (view.screen === 'party') html = renderParty();
    else if (view.screen === 'you') html = renderYou();
    else if (view.screen === 'char') html = renderCharEdit();
    else if (view.screen === 'diary') html = renderDiary();
    else if (view.screen === 'map') html = renderMapPage();
    else html = renderMain();
    // the entrance plays when the screen changes, not on every redraw of the same one
    const enter = view.screen !== lastScreen;
    lastScreen = view.screen;
    // a redraw after an action, not a new screen or a new paper: nothing is dealt again
    const ov = overlayKey();
    const sameOv = ov === lastOverlay;
    lastOverlay = ov;
    const scroll = enter || !sameOv ? [] : grabScroll();
    const panel = view.panel ? renderPanel() : '';
    stageEl.classList.toggle('quiet', !enter);
    stageEl.classList.toggle('quiet-ov', sameOv);
    stageEl.innerHTML = `<div class="hub-screen${enter ? ' enter' : ''}">${html}</div>${panel}`;
    if (view.screen === 'main' && model) setBackground(model.bg ? model.bg.url : '');
    if (view.panel === 'rooms') hydrateRooms();
    if (view.panel === 'heard' && view.hopen) fitReader();   // measured before the first paint: no jump
    if (!view.panel) lastPnKey = '';
    if (view.screen === 'map') hydrateMapRoom();
    const art = view.screen === 'main' && stageEl.querySelector('img[data-dng-art]');
    if (art) dungeonsPicture(art.getAttribute('data-dng-art')).then(u => { if (u && art.isConnected) { art.src = u; art.classList.add('on'); } });
    // nothing may scroll the fixed layers (a focused field would)
    hubEl.scrollTop = 0; hubEl.scrollLeft = 0; stageEl.scrollTop = 0; stageEl.scrollLeft = 0;
    restoreScroll(scroll);
    // the new actor stands where the mouse left the old one
    actorEl = view.screen === 'main' ? stageEl.querySelector('.hub-actor') : null;
    if (actorEl && (pX || pY) && settings.motion !== 'calm') actorEl.style.transform = `translate(${(pX * 14).toFixed(1)}px, ${(pY * 6).toFixed(1)}px)`;
    // the clicked button is gone after a redraw: keep the focus in the menu
    if (!root.activeElement) hubEl.focus({ preventScroll: true });
}
function toast(text) {
    if (!stageEl) return;
    const old = stageEl.querySelector('.hub-toast');
    if (old) old.remove();
    const d = document.createElement('div');
    d.className = 'hub-toast';
    d.setAttribute('role', 'status');
    d.textContent = text;
    stageEl.appendChild(d);
    setTimeout(() => d.remove(), 2600);
}
const closeBtns = (extra = '') => `<div class="hub-close">${extra}<button type="button" class="hub-btn hub-sq" data-act="close" aria-label="${esc(t('close'))}" title="${esc(t('close'))}">${ico(I.x, 22)}</button></div>`;

function renderMain() {
    const m = model;
    if (!m) return closeBtns();
    const f = m.focus;
    const name = f ? f.name : (m.ent && m.ent.kind === 'group' ? m.ent.g.name : '');
    const plateWhere = (f && whereText(whereOf(m.ms, f.name))) || (m.here ? [m.here.room, m.here.loc || m.here.block].filter(Boolean).join(' · ') : '') || (m.scene && m.scene.location) || '';
    const trust = m.npc && typeof m.npc.trust === 'number' ? Math.max(0, Math.min(100, Math.round(m.npc.trust))) : null;
    const line = m.lines.length ? m.lines[view.line % m.lines.length] : '';
    const actor = !f ? '' : m.sprite ? `
        <div class="hub-rim"></div>
        <button type="button" class="hub-btn hub-sprite-btn" data-act="talk" aria-label="${esc(name)}">
            <div class="hub-sprite">${img(m.sprite, '', name)}</div>
        </button>` : `
        <div class="hub-rim" style="top:100px;height:660px"></div>
        <button type="button" class="hub-btn hub-play-btn" data-act="talk" aria-label="${esc(name)}">
            <div class="hub-play">
                <div class="back b1">${CARD_BACK}</div>
                <div class="back b2">${CARD_BACK}</div>
                ${playCard(f, name)}
            </div>
        </button>`;
    const bubble = line ? `
        <div class="hub-bubble${m.sprite ? '' : ' low'}" role="status">
            <div class="who">${esc(clip(m.speaker || name, 30))}</div>
            <div class="say">${esc(line)}</div>
            ${m.lines.length > 1 ? `<div class="more">${(view.line % m.lines.length) + 1} / ${m.lines.length}</div>` : ''}
            <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true">${m.sprite ? '<path d="M0 0 L22 14 L0 12 Z" fill="#ece0c6" stroke="#a8844f"></path>' : '<path d="M0 16 L22 2 L0 4 Z" fill="#ece0c6" stroke="#a8844f"></path>'}</svg>
        </div>` : '';

    // top counters
    const counters = [];
    if (m.scene && (m.scene.date || m.scene.time)) counters.push(`<div class="hub-counter">${ico(I.clock, 24, settings.accent)}<span>${esc(clip([m.scene.date, m.scene.time].filter(Boolean).join(' · '), 44))}</span></div>`);
    if (hasPhone()) counters.push(`<div class="hub-counter">${ico(I.mail, 24, settings.accent)}<span>${esc(t('letters', { n: phoneUnread() }))}</span></div>`);
    if (hasMap() && m.ms) counters.push(`<div class="hub-counter">${ico(I.key, 24, settings.accent)}<span>${esc(t('secrets', { n: m.heard.length }))}</span></div>`);

    // medallions
    const seen = (m.chatId && settings.seen[m.chatId]) || {};
    const medals = [];
    if (hasMap()) medals.push(medal('chronicle', I.scroll, t('chronicle'), m.chron.length > (seen.chron || 0)));
    if (hasDiary()) medals.push(medal('calendar', I.cal, t('calendar'), false));
    if (hasMap()) medals.push(medal('heard', I.ear, t('heard'), m.heard.length > (seen.heard || 0)));
    if (hasDiary()) medals.push(medal('gifts', I.gift, t('gifts'), false));

    // right column
    const ctx = getContext();
    const chars = ctx.characters || [];
    const deckN = chars.filter(c => isShown('c:' + c.avatar)).length + (ctx.groups || []).filter(g => isShown('g:' + g.id)).length;
    const deckFaces = chars.filter(c => (!f || c.avatar !== f.avatar) && isShown('c:' + c.avatar)).sort((a, b) => (Number(b.date_last_chat) || 0) - (Number(a.date_last_chat) || 0)).slice(0, 5);
    const slideAt = ((Date.now() - slideStart) / 1000) % Math.max(1, deckFaces.length * 3.5);
    const from = m.here ? (m.here.loc || m.here.block || m.here.map) : (m.scene && m.scene.location) || '';
    const to = m.here ? m.here.room : '';
    const stubTop = (m.scene && m.scene.date) || fmtDate(m.rec[0] && m.rec[0].last) || '';
    const stubMid = m.scene && m.scene.day ? t('day_n', { n: m.scene.day }) : (m.items ? msgs(m.items) : '');
    const idx = f ? chars.findIndex(c => c.avatar === f.avatar) : -1;
    const dyStats = m.dy ? [m.dy.entries && m.dy.entries.length ? t('entries_n', { n: m.dy.entries.length }) : '', m.dy.events && m.dy.events.length ? t('events_n', { n: m.dy.events.length }) : '', m.dy.gifts && m.dy.gifts.length ? t('gifts_n', { n: m.dy.gifts.length }) : ''].filter(Boolean) : [];
    const whereN = m.ms && m.ms.where ? Object.values(m.ms.where).filter(w => w && (w.kind === 'room' || w.kind === 'away')).length : 0;
    const mapCap = [m.here && (m.here.loc || m.here.block), t('who_where')].filter(Boolean).join(' · ');
    const dng = f ? dungeonsOf(f.name) : null;
    const dngHero = dng && Array.isArray(dng.heroes) ? dng.heroes.filter(h => h && h.img).sort((a, b) => (b.rar || 4) - (a.rar || 4))[0] : null;
    const dngArt = dngHero ? String(dngHero.img) : '';
    const dngCap = !hasDungeons() ? t('dng_cap') : !dng || !dng.forged ? t('dng_unforged') : t('dng_stats', { n: (dng.heroes || []).length, s: (dng.heroes || []).filter(h => h && h.rar === 5).length });
    const ch1 = m.chron[0], ch2 = m.chron[1];
    const chronLine = c => c ? `${c.names.join(', ')}: ${c.text}` : '';
    const noChat = !m.chatId;

    return `
    <div class="hub-rays"></div>
    <div class="hub-actor">${actor}</div>
    <div class="hub-wisp" style="left:160px;bottom:120px;width:700px;height:140px;background:radial-gradient(ellipse at 50% 50%,rgba(200,185,210,0.22) 0%,rgba(200,185,210,0) 65%);animation-duration:16s"></div>
    <div class="hub-wisp" style="left:220px;bottom:40px;width:620px;height:120px;background:radial-gradient(ellipse at 50% 50%,rgba(143,29,44,0.22) 0%,rgba(143,29,44,0) 65%);animation-duration:22s;animation-delay:-8s"></div>
    ${MOTES}
    ${bubble}
    ${f || name ? `<div class="hub-plate">
        <div class="hub-medal-ring">${MEDAL_RING}<div class="face">${f ? img(thumbUrl(f.avatar), '', name) : ''}</div></div>
        <div style="display:flex;flex-direction:column;gap:3px;min-width:220px;max-width:330px">
            <div class="nm hub-ell">${esc(name)}</div>
            ${plateWhere ? `<div class="where hub-ell">${esc(plateWhere)}</div>` : ''}
            ${trust !== null ? `<div style="display:flex;align-items:center;gap:8px"><div class="hub-bar"><i style="width:${trust}%"></i></div><span style="font-size:13px;color:#cbbca4">${trust}</span></div>` : ''}
        </div>
    </div>` : ''}
    ${counters.length ? `<div class="hub-counters">${counters.join('')}</div>` : ''}
    ${closeBtns(`${hasPhone() ? `<button type="button" class="hub-btn hub-sq" data-act="phone" aria-label="${esc(t('phone'))}" title="${esc(isOff('rpg_phone') ? t('module_off', { name: 'RPG Phone' }) : t('phone'))}" ${noChat || isOff('rpg_phone') ? 'disabled' : ''}>${ico(I.phone, 22)}${phoneUnread() ? `<span class="hub-badge">${phoneUnread() > 9 ? '9+' : phoneUnread()}</span>` : ''}</button>` : ''}
        <button type="button" class="hub-btn hub-sq" data-act="settings" aria-label="${esc(t('settings'))}" title="${esc(t('settings'))}">${ico(I.gear, 22)}</button>`)}
    ${medals.length ? `<div class="hub-medals">${medals.join('')}</div>` : ''}
    <div class="hub-col">
        <div class="hub-star" style="left:-14px;top:6px">${SPARK(16)}</div>
        <div class="hub-star" style="left:250px;top:168px;animation-delay:-1.4s">${SPARK(12)}</div>
        <div class="hub-star" style="left:540px;top:410px;animation-delay:-2.2s">${SPARK(14)}</div>

        <button type="button" class="hub-btn hub-tile hub-cta hub-ticket${noChat ? ' off' : ''}${view.torn ? ' tearing torn' : ''}" data-act="continue" aria-label="${esc(t('continue'))}">
            <div class="main hub-paper hub-cut">
                <div class="hub-inner"></div>
                <div style="display:flex;align-items:center;gap:12px">${GEM}<span class="go">${esc(t('continue'))}</span>${GEM}</div>
                ${from || to ? `
                <div class="sub" style="display:flex;gap:14px">${from ? `<span>· ${esc(t('place'))} ·</span>` : ''}${from && to ? '<span style="width:48px"></span>' : ''}${to ? `<span>· ${esc(t('room'))} ·</span>` : ''}</div>
                <div class="route">${from ? `<span class="stop">${esc(from)}</span>` : ''}${from && to ? '<svg width="40" height="14" viewBox="0 0 40 14" aria-hidden="true"><path d="M2 2l6 5-6 5M14 2l6 5-6 5M26 2l6 5-6 5" stroke="#8f1d2c" stroke-width="2.4" fill="none"></path></svg>' : ''}${to ? `<span class="stop">${esc(to)}</span>` : ''}</div>` : `<div class="sub">${esc(noChat ? t('no_chat') : name)}</div>`}
            </div>
            <div class="stub">
                <small>${esc(stubTop)}</small>
                ${stubMid ? `<b>${esc(stubMid)}</b>` : '<span></span>'}
                <em>${esc(t('enter'))}</em>
            </div>
        </button>

        <button type="button" class="hub-btn hub-tile hub-deckcard" data-act="deck" aria-label="${esc(t('deck'))}">
            <div class="sheet hub-paper" style="transform:rotate(-9deg) translate(-8px,6px);opacity:.85"></div>
            <div class="sheet hub-paper" style="transform:rotate(-4deg) translate(-3px,2px);opacity:.92"></div>
            <div class="top hub-paper hub-cut">
                <div class="hub-inner"></div>
                <span class="hub-ribbon" style="padding:4px 22px;background:#c9a46a;color:#3a1a14;font-family:var(--f-title);font-size:20px;border:1px solid #8a6a3a">${esc(t('deck'))}</span>
                <div class="slides">${deckFaces.map((c, i) => `<img src="${esc(avatarUrl(c.avatar))}" alt="" loading="lazy" draggable="false" style="animation-duration:${deckFaces.length * 3.5}s;animation-delay:${(i * 3.5 - slideAt).toFixed(2)}s${deckFaces.length === 1 ? ';animation:none;opacity:1' : ''}">`).join('')}</div>
                <span style="margin-top:auto;font-size:11px;letter-spacing:0.18em;color:#6b4a2c">${esc(t('deck_cap', { n: deckN }))}</span>
            </div>
        </button>

        <button type="button" class="hub-btn hub-tile hub-folder${f ? '' : ' off'}" data-act="dossier" aria-label="${esc(t('dossier'))}">
            <div class="tab"></div>
            <div class="body hub-paper">
                <div class="hub-inner"></div>
                <div style="display:flex;justify-content:space-between;align-items:flex-start">
                    <div style="display:flex;flex-direction:column;min-width:0">
                        <span style="font-size:12px;letter-spacing:0.2em;color:#6b4a2c">${esc(t('case_no', { n: idx >= 0 ? idx + 1 : '—' }))}</span>
                        <span style="font-family:var(--f-title);font-size:30px;color:#3a1a14;line-height:1.1">${esc(t('dossier'))}</span>
                    </div>
                    <span class="hub-stamp">${esc(t('secret'))}</span>
                </div>
                <div class="hub-ell" style="margin-top:8px;font-size:13px;color:#5a3a24">${esc([f ? f.name : '', ...dyStats].filter(Boolean).join(' · '))}</div>
            </div>
        </button>

        <button type="button" class="hub-btn hub-tile hub-small hub-dng${hasDungeons() && f ? '' : ' off'}" data-act="dungeons" aria-label="${esc(t('dng'))}" title="${esc(!hasDungeons() ? t('not_installed', { name: 'RPG Dungeons' }) : isOff('rpg_dungeons') ? t('module_off', { name: 'RPG Dungeons' }) : t('dng'))}">
            <div class="card hub-cut">
                ${dngArt ? `<img class="art" data-dng-art="${esc(dngArt)}" alt="" draggable="false">` : ''}
                <div class="veil"></div>
                <span class="h">${esc(t('dng'))}</span>
                <span class="rabbit">${RABBIT}</span>
                <span class="cap">${esc(dngCap)}</span>
                ${dng && dng.tickets ? `<span class="tix">${ico('<rect x="3" y="7" width="18" height="10" rx="2"></rect><path d="M9 7v10" stroke-dasharray="2 2"></path>', 14, '#ffe2a8', 1.8)}${dng.tickets}</span>` : ''}
            </div>
        </button>

        <button type="button" class="hub-btn hub-tile hub-small r${hasMap() && m.ms ? '' : ' off'}" data-act="map" aria-label="${esc(t('map'))}" title="${esc(!hasMap() ? t('not_installed', { name: 'RPG Map' }) : isOff('rpg_map_engine') ? t('module_off', { name: 'RPG Map' }) : t('map'))}">
            <div class="card hub-paper hub-cut" style="gap:4px">
                <div class="hub-inner"></div>
                <span class="h">${esc(t('map'))}</span>
                <div style="position:relative;width:84px;height:66px">
                    <svg width="84" height="66" viewBox="0 0 84 66" fill="none" aria-hidden="true"><path d="M4 12l24-8 28 8 24-8v50l-24 8-28-8-24 8z M28 4v50M56 12v50" stroke="#3a2418" stroke-width="1.6"></path><path d="M42 18a8 8 0 0 1 8 8c0 6-8 14-8 14s-8-8-8-14a8 8 0 0 1 8-8z" fill="#8f1d2c"></path></svg>
                    ${whereN ? `<span style="position:absolute;right:-10px;top:-6px;padding:1px 6px;border-radius:10px;background:#3a1a14;color:#f6ead2;font-size:12px">${whereN}</span>` : ''}
                </div>
                <span class="cap">${esc(mapCap)}</span>
            </div>
        </button>

        ${hasMap() ? `
        <button type="button" class="hub-btn hub-tile hub-chron" data-act="chronicle" aria-label="${esc(t('chronicle'))}">
            <div class="card hub-paper hub-cut">
                <div class="hub-inner"></div>
                <div class="clock">${ico(I.clock, 40, '#3a2418', 1.4)}<span style="font-family:var(--f-title);font-size:18px;color:#6e1424">${esc(clip((m.scene && m.scene.time) || '', 10))}</span></div>
                <div style="display:flex;flex-direction:column;gap:2px;min-width:0">
                    <span style="font-size:12px;letter-spacing:0.2em;color:#6b4a2c">${esc(t('while_away'))}</span>
                    <span class="l1 hub-ell">${esc(ch1 ? chronLine(ch1) : t('quiet'))}</span>
                    ${ch2 ? `<span class="l2 hub-ell">${esc(chronLine(ch2))}</span>` : ''}
                </div>
            </div>
            <div class="rib">${esc(t('chronicle'))}</div>
        </button>` : ''}
    </div>
    <nav class="hub-dock">
        <button type="button" class="hub-btn" data-act="recent">${ico(I.star, 26, '#e9dfcc', 1.5)}${esc(t('meetings'))}</button>
        <button type="button" class="hub-btn" data-act="deck">${ico(I.cards, 26, '#e9dfcc', 1.5)}${esc(t('deck'))}</button>
        ${hasMap() && m.ms ? `<button type="button" class="hub-btn" data-act="rooms">${ico(I.frame, 26, '#e9dfcc', 1.5)}${esc(t('rooms'))}</button>` : ''}
        ${hasDiary() && m.dy ? `<button type="button" class="hub-btn" data-act="diary">${ico('<path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z M8 4v16"></path><path d="M11 9h5M11 12h5"></path>', 26, '#e9dfcc', 1.5)}${esc(t('diary'))}</button>` : ''}
        <button type="button" class="hub-btn" data-act="persona">${ico(I.user, 26, '#e9dfcc', 1.5)}${esc(t('you'))}</button>
    </nav>
    ${m.bg && m.bg.name ? `<div class="hub-bgnote hub-ell">${esc(t('bg_from', { name: m.bg.name }))}</div>` : ''}`;
}
const medal = (act, icon, label, hot) => `
    <button type="button" class="hub-btn hub-medal${hot ? ' hot' : ''}" data-act="${act}">
        <span class="disc">${ico(icon, 28, '#f6ead2')}</span>
        <span class="lbl hub-ribbon">${esc(label)}</span>
        ${hot ? '<span class="gem"></span>' : ''}
    </button>`;
const MEDAL_RING = `<svg width="86" height="86" viewBox="0 0 86 86" fill="none" aria-hidden="true">
    <circle cx="43" cy="43" r="38" stroke="#c6a15b" stroke-width="2"></circle>
    <circle cx="43" cy="43" r="32" stroke="#c6a15b" stroke-opacity="0.45" stroke-width="1" stroke-dasharray="2 3"></circle>
    <path d="M8 60 C2 40 10 18 30 8 M14 66 C26 74 38 76 50 74" stroke="#5f7a4a" stroke-width="2"></path>
    <circle cx="12" cy="28" r="5" fill="#8f1d2c"></circle><circle cx="12" cy="28" r="2.4" fill="#c03a4b"></circle>
    <circle cx="74" cy="66" r="5" fill="#8f1d2c"></circle><circle cx="74" cy="66" r="2.4" fill="#c03a4b"></circle></svg>`;
const MOTES = [[380, 9, 0, 6, '#e8c882'], [470, 12, -4, 5, '#f3e6c8'], [560, 10, -7, 7, '#c03a4b'], [640, 13, -2, 5, '#e8c882']]
    .map(([l, d, dl, s, c]) => `<div class="hub-mote" style="left:${l}px;animation-duration:${d}s;animation-delay:${dl}s"><svg width="${s}" height="${s}" viewBox="0 0 6 6" aria-hidden="true"><circle cx="3" cy="3" r="3" fill="${c}"></circle></svg></div>`).join('');
/* a character without a sprite: their card from the deck, big, with two face-down cards behind */
const CARD_BACK = `<svg width="100%" height="100%" viewBox="0 0 300 440" preserveAspectRatio="none" aria-hidden="true">
    <defs><pattern id="hubBack" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="24" height="24" fill="#3a0c16"></rect><path d="M0 12h24M12 0v24" stroke="#c6a15b" stroke-opacity=".35" stroke-width="1.2"></path><circle cx="12" cy="12" r="2.2" fill="#c6a15b" fill-opacity=".5"></circle></pattern></defs>
    <rect x="0" y="0" width="300" height="440" rx="16" fill="#efe5d0"></rect>
    <rect x="14" y="14" width="272" height="412" rx="10" fill="url(#hubBack)" stroke="#c6a15b" stroke-width="2"></rect>
    <path d="M150 170 l40 50 -40 50 -40 -50z" fill="#8f1d2c" stroke="#e8c882" stroke-width="3"></path></svg>`;
function playCard(ch, name) {
    const chars = getContext().characters || [];
    const idx = Math.max(0, chars.findIndex(c => c.avatar === ch.avatar));
    const suit = SUITS[idx % 4], rank = RANKS[idx % 4], red = suit === 'heart' || suit === 'diamond';
    const col = red ? '#8f1d2c' : '#1b1418';
    return `<div class="face">
        <div class="idx" style="left:14px;top:10px;color:${col}">${rank}${suitSvg(suit, 18, col)}</div>
        <div class="idx" style="right:14px;bottom:10px;transform:rotate(180deg);color:${col}">${rank}${suitSvg(suit, 18, col)}</div>
        <div class="pic">${img(avatarUrl(ch.avatar), '', name)}</div>
        <div class="nm hub-ribbon">${esc(clip(name, 24))}</div>
    </div>`;
}
/* ============================================================ PANELS */
/* Panels are scenes on the dark veil, not sheets: no parchment behind them and no scrollbars —
   things are dealt a few at a time and you turn the page, as in the deck. */
const PANEL_PER = { chronicle: 6, calendar: 9, gifts: 4, recent: 4, rooms: 8 };
const tilt = (i, arr) => arr[i % arr.length];
/* split a long text into page-sized pieces, at sentence ends where possible */
function chunkText(text, budget) {
    const out = [];
    let cur = '';
    String(text || '').split(/(?<=[.!?…»"])\s+|\n+/).filter(Boolean).forEach(part => {
        if ((cur + ' ' + part).length > budget && cur) { out.push(cur.trim()); cur = part; }
        else cur = (cur + ' ' + part).trim();
        while (cur.length > budget * 1.4) { out.push(cur.slice(0, budget).replace(/\s+\S*$/, '') + '…'); cur = '…' + cur.slice(cur.slice(0, budget).replace(/\s+\S*$/, '').length).trim(); }
    });
    if (cur) out.push(cur.trim());
    return out.length ? out : [''];
}
/* Overheard: letters are envelopes, doors are doors. One is opened at a time and read whole. */
const HEARD_PER = 6;
const heardId = (o, i) => String(o.id || ('h' + (o.at || 0) + '-' + i));
function heardOpened() {
    const s0 = model && model.chatId && settings.seen[model.chatId];
    return new Set(s0 && Array.isArray(s0.open) ? s0.open : []);
}
function markHeardOpen(id) {
    if (!model || !model.chatId) return;
    const s0 = settings.seen[model.chatId] || (settings.seen[model.chatId] = {});
    const list = Array.isArray(s0.open) ? s0.open : [];
    if (!list.includes(id)) { list.push(id); s0.open = list.slice(-60); save(); }
}
const SEAL_ICON = '<path d="M12 4l2.4 5 5.6.6-4.2 3.8 1.2 5.6L12 16l-5 3 1.2-5.6L4 9.6 9.6 9z"></path>';
function heardList(m) {
    const all = (m.heard || []).map((o, i) => ({ o, id: heardId(o, i) })).reverse();
    const tab = ['letter', 'door'].includes(view.htab) ? view.htab : 'all';
    return { all, tab, list: tab === 'all' ? all : all.filter(x => x.o.kind === tab) };
}
function heardCard({ o, id }, i, opened) {
    const read = opened.has(id);
    const names = (Array.isArray(o.names) ? o.names : []).filter(Boolean);
    const faces = names.slice(0, 3).map(n => faceOf(n, 30)).join('');
    if (o.kind === 'letter') return `<button type="button" class="hub-btn hr-env${read ? ' read' : ''}" data-act="h-open" data-id="${esc(id)}" style="--tilt:${tilt(i, [-3, 2, -1.5, 3.5, -2.5, 1])}deg;animation-delay:${(i % 6) * 0.07}s" aria-label="${esc(t('letter'))}: ${esc(o.title || o.place || '')}">
        <span class="body"></span><span class="lace"></span><span class="flap"></span>
        <span class="post"><span>${esc(t('h_post'))}</span><b>№ ${esc(String(o.at || '·'))}</b></span>
        <span class="stampbox">${names.length ? faceOf(names[0], 46) : `<span class="pn-face" style="width:46px;height:46px">✉</span>`}</span>
        <span class="addr"><i>${esc(o.place ? t('h_from', { place: o.place }) : t('letter'))}</i><b>${esc(clip(o.title || t('h_untitled'), 60))}</b>${names.length ? `<span class="nms">${esc(names.join(' · '))}</span>` : ''}</span>
        <span class="seal${read ? ' broken' : ''}"><span class="h l"></span><span class="h r"></span>${ico(SEAL_ICON, 20, '#ffe2a8', 1.6)}</span>
        ${read ? '' : `<span class="new">${esc(t('h_sealed'))}</span>`}
    </button>`;
    return `<button type="button" class="hub-btn hr-door${read ? ' read' : ''}" data-act="h-open" data-id="${esc(id)}" style="animation-delay:${(i % 6) * 0.07}s" aria-label="${esc(t('door'))}: ${esc(o.place || '')}">
        <span class="arch"><span class="pnl a"></span><span class="pnl b"></span><span class="pnl c"></span><span class="pnl d"></span>
            <span class="knob"></span><span class="hole"></span><span class="glow"></span></span>
        <span class="plaque"><b>${esc(clip(o.place || t('door'), 26))}</b>${o.loc ? `<i>${esc(clip(o.loc, 30))}</i>` : ''}</span>
        <span class="who">${faces}</span>
        ${read ? '' : `<span class="new">${esc(t('h_voices'))}</span>`}
    </button>`;
}
function heardReader(m) {
    const { all } = heardList(m);
    const x = all.find(y => y.id === view.hopen);
    if (!x) return '';
    const o = x.o;
    if (o.kind === 'letter') {
        const ps = (Array.isArray(o.paragraphs) ? o.paragraphs : []).map(String).filter(Boolean);
        const len = ps.join(' ').length;
        const cols = len > 2600 ? 3 : len > 1100 ? 2 : 1;
        return `<div class="hr-read letter" data-act="h-close">
            <div class="hr-crack"><span class="h l"></span><span class="h r"></span></div>
            <div class="hr-paper" data-stop2="1">
                <div class="from">${esc(t('letter'))}${o.place ? ' · ' + esc(o.place) : ''}${o.loc ? ' · ' + esc(o.loc) : ''}</div>
                ${o.title ? `<div class="tt">${esc(o.title)}</div>` : ''}
                <div class="fit" data-max="24" style="column-count:${cols}">${ps.map(p => `<p>${esc(p)}</p>`).join('')}${o.sign ? `<div class="sign">${esc(o.sign)}</div>` : ''}</div>
                <div class="who">${(o.names || []).slice(0, 5).map(n => faceOf(n, 30)).join('')}</div>
            </div>
            <button type="button" class="hub-btn hub-sq x hr-x" data-act="h-close" aria-label="${esc(t('close'))}">${ico(I.x, 22)}</button>
        </div>`;
    }
    const ls = (Array.isArray(o.lines) ? o.lines : []).filter(Boolean);
    const len = ls.reduce((a, l) => a + String(l.say || l.act || '').length, 0);
    return `<div class="hr-read door" data-act="h-close">
        <div class="hr-scene" data-stop2="1">
            <div class="hd">${ico('<circle cx="12" cy="8" r="4"></circle><path d="M10 11l-2 10h8l-2-10"></path>', 18, '#e8c882', 1.6)}<span>${esc(t('door'))}${o.place ? ' · ' + esc(o.place) : ''}${o.loc ? ' · ' + esc(o.loc) : ''}</span></div>
            <div class="fit" data-max="22" style="column-count:${len > 2400 ? 2 : 1}">${ls.map(l => l.say
                ? `<div class="ln">${faceOf(l.who, 38)}<div><b>${esc(l.who || '…')}</b><span>${esc(l.say)}</span></div></div>`
                : (l.act ? `<div class="act">${esc(l.act)}</div>` : '')).join('')}</div>
        </div>
        <span class="hr-hole"></span>
        <button type="button" class="hub-btn hub-sq x hr-x" data-act="h-close" aria-label="${esc(t('close'))}">${ico(I.x, 22)}</button>
    </div>`;
}
/* the open letter or scene fills its sheet: smaller type, never a second page */
function fitReader() {
    const el = stageEl && stageEl.querySelector('.hr-read .fit');
    if (!el) return;
    const max = Number(el.getAttribute('data-max')) || 22;
    const over = sz => { el.style.fontSize = sz + 'px'; return el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1; };
    // the largest size that fits, in a few measurements instead of one per pixel
    let lo = 14, hi = max, best = 14;
    if (!over(max)) best = max;
    else {
        while (lo <= hi) { const mid = (lo + hi) >> 1; if (over(mid)) hi = mid - 1; else { best = mid; lo = mid + 1; } }
    }
    el.classList.toggle('over', over(best));
    // the hand font may still be on its way: measure once more when it is here
    if (!fitReader.fonts && document.fonts && document.fonts.status !== 'loaded') { fitReader.fonts = true; document.fonts.ready.then(() => { fitReader.fonts = false; if (isOpen && view.hopen) fitReader(); }); }
}
/* the desk calendar: nine days on a leaf */
const CAL_GLYPHS = ['spade', 'heart', 'club', 'diamond'];
function calCell(e, i) {
    const pic = safeUrl(e.portrait || '');
    const day = String(e.when || '').match(/\d{1,4}/);
    const rest = clip(String(e.when || '').replace(day ? day[0] : '', '').replace(/^[\s·,.-]+/, '').replace(/\s+([,.])/g, '$1').replace(/^[,.\s]+$/, ''), 30);
    const who = String(e.who || '').split(/\s*[,;]\s*/).filter(Boolean);
    return `<button type="button" class="hub-btn cal-cell${view.pzoom === i ? ' on' : ''}" data-act="p-zoom" data-i="${i}" style="--tilt:${tilt(i, [-4, 3, -2, 5, -3, 2])}deg;--nt:${tilt(i, [2, -2.5, 1.5, -1, 2.5, -1.8])}deg" aria-label="${esc(e.title || '')}">
        <span class="num">${day ? esc(day[0]) : '✦'}</span>
        ${rest ? `<span class="wd">${esc(rest)}</span>` : ''}
        <span class="stk">${pic ? img(pic) : (who.length ? faceOf(who[0], 64) : `<span class="glyph">${suitSvg(CAL_GLYPHS[i % 4], 40, 'rgba(143,29,44,.6)')}</span>`)}</span>
        <span class="note"><b>${esc(clip(e.title || '', 60))}</b>${e.where ? `<i>${esc(clip(e.where, 34))}</i>` : ''}</span>
    </button>`;
}
function calZoom(e, i) {
    const pic = safeUrl(e.portrait || '');
    return `<div class="cal-zoom" data-act="p-zoom" data-i="${i}">
        <div class="card" data-stop2="1">
            <span class="tape"></span><span class="clip"></span>
            ${pic ? `<div class="ph">${img(pic)}</div>` : ''}
            <div class="wh">${esc(e.when || '')}</div>
            <div class="tt">${esc(e.title || '')}</div>
            ${e.where ? `<div class="pl">${ico('<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"></path><circle cx="12" cy="10" r="2.5"></circle>', 15, '#8f1d2c', 1.8)}${esc(e.where)}</div>` : ''}
            ${e.what ? `<div class="tx">${esc(e.what)}</div>` : ''}
            ${e.who ? `<div class="who">${String(e.who).split(/\s*[,;]\s*/).filter(Boolean).slice(0, 6).map(n => faceOf(n, 30)).join('')}<span>${esc(e.who)}</span></div>` : ''}
        </div>
        <button type="button" class="hub-btn hub-sq x hr-x" data-act="p-zoom" data-i="${i}" aria-label="${esc(t('close'))}">${ico(I.x, 22)}</button>
    </div>`;
}
let lastPnKey = '';
function renderPanel() {
    const m = model || {};
    const p = view.panel;
    let title = '', lead = '', items = [], cls = p, unit = 1, tabs = '', over = '', calEv = null;
    if (p === 'chronicle') {
        title = t('chronicle'); lead = t('p_chron_lead');
        items = (m.chron || []).map((c, i) => `
            <div class="pn-note ${i % 2 ? 'r' : 'l'}" style="--tilt:${tilt(i, [-1.6, 1.2, -0.8, 1.8, -1.2])}deg;animation-delay:${(i % 6) * 0.06}s">
                <span class="pin"></span>
                <div class="who">${c.names.map(n => faceOf(n, 34)).join('')}<span class="nm">${esc(c.names.join(', '))}</span></div>
                <div class="tx">${esc(c.text)}</div>
                ${c.when ? `<span class="stamp">${esc(c.when)}</span>` : ''}
            </div>`);
        unit = PANEL_PER.chronicle;
    } else if (p === 'calendar') {
        title = t('calendar'); lead = t('p_cal_lead');
        calEv = (m.dy && Array.isArray(m.dy.events) ? m.dy.events : []).filter(Boolean).slice().sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));
        items = calEv.map((e, i) => calCell(e, i));
        unit = PANEL_PER.calendar;
    } else if (p === 'heard') {
        title = t('heard'); lead = t('p_heard_lead');
        const hl = heardList(m);
        const opened = heardOpened();
        items = hl.list.map((x, i) => heardCard(x, i, opened));
        unit = HEARD_PER;
        const n = k => k === 'all' ? hl.all.length : hl.all.filter(x => x.o.kind === k).length;
        tabs = `<div class="hr-tabs">${[['all', 'h_all'], ['letter', 'h_letters'], ['door', 'h_doors']].map(([k, l]) => `<button type="button" class="hub-btn hr-tab${hl.tab === k ? ' on' : ''}" data-act="h-tab" data-tab="${k}">${esc(t(l))}<span>${n(k)}</span></button>`).join('')}</div>`;
        over = view.hopen ? heardReader(m) : '';
    } else if (p === 'gifts') {
        title = t('gifts'); lead = t('p_gifts_lead');
        const gs = (m.dy && Array.isArray(m.dy.gifts) ? m.dy.gifts : []).filter(Boolean).slice().reverse();
        items = gs.map((g, i) => {
            const got = g.dir === '←';
            const pic = safeUrl(g.portrait || '');
            return `<div class="pn-tagwrap" style="--tilt:${tilt(i, [-4, 3, -2, 4.2, -3])}deg;animation-delay:${(i % 4) * 0.08}s"><div class="pn-swing"><span class="string"></span><div class="pn-tag${got ? ' got' : ''}">
                <span class="hole"></span>
                <div class="dir">${esc(got ? t('got') : t('gave'))}</div>
                ${pic ? `<div class="ph">${img(pic)}</div>` : `<div class="box">${GIFT_BOX(got)}</div>`}
                <div class="tt">${esc(g.item || '')}</div>
                ${g.who ? `<div class="who">${faceOf(g.who, 26)}<span>${esc(g.who)}</span></div>` : ''}
                ${g.why ? `<div class="tx">${esc(g.why)}</div>` : ''}
                ${g.when ? `<div class="wh">${esc(g.when)}</div>` : ''}
            </div></div></div>`;
        });
        unit = PANEL_PER.gifts;
    } else if (p === 'recent') {
        title = t('meetings'); lead = t('p_recent_lead');
        items = (m.rec || []).filter(recShown).map(r => ({ r, e: entityOf(r) })).slice(0, 24).map(({ r, e }, i) => {
            const nm = e.kind === 'group' ? e.g.name : e.ch.name;
            const pic = e.kind === 'group' ? (groupPicture(e.g) || avatarUrl((membersOf(e.g)[0] || {}).avatar)) : avatarUrl(e.ch.avatar);
            const sn = settings.snaps[r.file_id];
            const ms = clip((sn && sn.line) || plain(r.mes), 150);
            return `<button type="button" class="hub-btn pn-pola" data-act="open-recent" data-i="${i}" style="--tilt:${tilt(i, [-2.2, 1.6, -0.8, 2.4])}deg;animation-delay:${(i % 4) * 0.07}s">
                <span class="tape"></span>
                <span class="ph">${pic ? img(pic, '', nm) : ''}${e.kind === 'group' ? `<span class="grp">${ico(I.group, 16, '#ffe2a8')}</span>` : ''}</span>
                <span class="nm">${esc(nm)}</span>
                <span class="ms">${esc(ms)}</span>
                <span class="dt">${esc(fmtDate(r.last))}</span>
            </button>`;
        });
        unit = PANEL_PER.recent;
    } else if (p === 'rooms') {
        title = t('rooms'); lead = t('p_rooms_lead');
        items = roomsOf(m.ms).filter(r => hasPicture(r.sub)).map((r, i) => `<button type="button" class="hub-btn hub-room" data-act="pick-room" data-i="${i}" title="${esc([r.map, r.loc || r.block, r.room].filter(Boolean).join(' · '))}" style="animation-delay:${(i % 8) * 0.04}s"><img class="ph" data-room="${i}" alt="" draggable="false"><span class="cap">${esc(r.room)}</span></button>`);
        unit = PANEL_PER.rooms;
    }
    const pages = Math.max(1, Math.ceil(items.length / unit));
    view.pp = Math.max(0, Math.min(pages - 1, view.pp || 0));
    const shown = items.slice(view.pp * unit, view.pp * unit + unit);
    // the same page drawn again (a letter opened, a day zoomed): nothing is dealt anew
    const key = [p, view.pp, view.htab || ''].join('|');
    const still = key === lastPnKey;
    lastPnKey = key;
    let page;
    if (p === 'calendar') {
        const fill = Array.from({ length: Math.max(0, unit - shown.length) }, (_, k) => `<span class="cal-cell empty"><span class="glyph">${suitSvg(CAL_GLYPHS[(k + shown.length) % 4], 34, 'rgba(90,70,60,.22)')}</span></span>`);
        page = `<div class="cal-desk">
            <div class="cal-sticky"><span class="clip"></span><b>${esc(t('cal_sticky'))}</b><span>${esc(t('cal_count', { n: calEv.length }))}</span></div>
            <div class="cal-stand"></div>
            <div class="cal-board">
                <div class="cal-rings">${'<i></i>'.repeat(26)}</div>
                <div class="cal-sheet" data-page="${view.pp}">
                    <div class="cal-band"><span>${esc(t('cal_leaf', { n: view.pp + 1, of: pages }))}</span></div>
                    <div class="cal-grid">${shown.join('')}${fill.join('')}</div>
                </div>
            </div>
            ${view.pzoom != null && calEv[view.pzoom] ? calZoom(calEv[view.pzoom], view.pzoom) : ''}
        </div>`;
    } else page = shown.length ? (p === 'chronicle' ? `<div class="pn-thread">${shown.join('')}</div>` : shown.join('')) : `<div class="pn-none">${esc(t(p === 'heard' && view.htab && view.htab !== 'all' ? 'h_none' : 'empty'))}</div>`;
    return `<div class="hub-veil pn${still ? ' still' : ''}" data-act="panel-close">
        <div class="pn-wrap" role="dialog" aria-label="${esc(title)}" data-stop="1">
            <div class="pn-head"><div class="pn-banner hub-ribbon">${esc(title)}</div><div class="pn-lead">${esc(lead)}</div>${tabs}</div>
            <button type="button" class="hub-btn hub-sq pn-x x" data-act="panel-close" aria-label="${esc(t('close'))}">${ico(I.x, 22)}</button>
            <div class="pn-page ${cls}" data-page="${view.pp}">${page}</div>
            ${pages > 1 ? `
            <button type="button" class="hub-btn hub-arrow l" data-act="pp" data-dir="-1" aria-label="${esc(t('prev'))}" ${view.pp > 0 ? '' : 'disabled'}>${ico(I.left, 30, '#e8c882', 2)}</button>
            <button type="button" class="hub-btn hub-arrow r" data-act="pp" data-dir="1" aria-label="${esc(t('next'))}" ${view.pp < pages - 1 ? '' : 'disabled'}>${ico(I.right, 30, '#e8c882', 2)}</button>
            <div class="pn-dots">${pages <= 20 ? Array.from({ length: pages }, (_, n) => `<button type="button" class="hub-btn hub-dot${n === view.pp ? ' on' : ''}" data-act="pp-go" data-n="${n}" aria-label="${esc(t('page', { n: n + 1 }))}"></button>`).join('') : ''}<span>${view.pp + 1} / ${pages}</span></div>` : ''}
            ${over}
        </div></div>`;
}
const GIFT_BOX = got => `<svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="26" width="44" height="30" rx="2" fill="${got ? '#2f4a42' : '#8f1d2c'}"></rect><rect x="7" y="18" width="50" height="10" rx="2" fill="${got ? '#3d5c52' : '#a8283a'}"></rect><rect x="29" y="18" width="6" height="38" fill="#e8c882"></rect><path d="M32 18c-6-10-16-10-14-3 1 4 9 3 14 3zM32 18c6-10 16-10 14-3-1 4-9 3-14 3z" fill="none" stroke="#e8c882" stroke-width="3"></path></svg>`;
function hydrateRooms() {
    const rs = roomsOf(model && model.ms).filter(r => hasPicture(r.sub));
    stageEl.querySelectorAll('img[data-room]').forEach(async el => {
        const r = rs[Number(el.getAttribute('data-room'))];
        if (!r) return;
        const u = (typeof r.sub.image === 'string' && r.sub.image) ? await roomPicture(r.sub) : safeUrl('/thumbnail?type=bg&file=' + encodeURIComponent(r.sub.bgFile));
        if (u && el.isConnected) el.src = u;
    });
}
/* a small round face for a name: their card picture if they are a character, a diary portrait,
   or their initial */
function faceOf(name, size) {
    const nm = String(name || '').trim();
    const ch = (getContext().characters || []).find(c => same(c.name, nm));
    const npc = !ch && model && model.dy ? npcOf(model.dy, nm) : null;
    const u = ch ? thumbUrl(ch.avatar) : safeUrl(npc && npc.portrait || '');
    return `<span class="pn-face" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.45)}px" title="${esc(nm)}">${u ? img(u, '', nm) : esc(nm.slice(0, 1).toUpperCase() || '?')}</span>`;
}
function markSeen(kind) {
    if (!model || !model.chatId) return;
    const s = settings.seen[model.chatId] || (settings.seen[model.chatId] = {});
    if (kind === 'chronicle') s.chron = model.chron.length;
    if (kind === 'heard') s.heard = model.heard.length;
    const keys = Object.keys(settings.seen);
    if (keys.length > SNAP_MAX) keys.filter(k => !settings.snaps[k]).forEach(k => delete settings.seen[k]);
    save();
}

/* ============================================================ TAGS — a parchment list, not a browser dropdown */
const safeColor = c => /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(String(c || '').trim()) ? String(c).trim() : '';
function tagList() {
    const ctx = getContext();
    const map = ctx.tagMap || {};
    const counts = {};
    Object.values(map).forEach(ids => (Array.isArray(ids) ? ids : []).forEach(id => { counts[id] = (counts[id] || 0) + 1; }));
    return (ctx.tags || []).filter(tg => tg && tg.id && tg.name).map(tg => ({ id: String(tg.id), name: String(tg.name), color: safeColor(tg.color), n: counts[tg.id] || 0 }));
}
function tagButton(cur, popKey) {
    const tg = tagList().find(x => x.id === cur);
    return `<button type="button" class="hub-btn hub-tagbtn${cur ? ' on' : ''}" data-act="pop" data-pop="${popKey}" aria-haspopup="listbox" aria-expanded="${view.pop === popKey}">
        <span class="gem" style="background:${tg && tg.color ? tg.color : '#c6a15b'}"></span><span class="hub-ell">${esc(tg ? tg.name : t('all_tags'))}</span>${ico('<path d="M6 9l6 6 6-6"></path>', 16, '#c6a15b', 2)}</button>`;
}
function tagPopover(cur, popKey, left) {
    if (view.pop !== popKey) return '';
    const list = tagList();
    const te = view.tagEdit;
    const row = (id, name, color, n) => {
        if (te && te.id === id && id) return `<div class="hub-tagedit">
            <input type="text" data-act="tag-name" maxlength="60" value="${esc(te.name)}" aria-label="${esc(t('tag_rename'))}">
            <div class="cols">${TAG_COLORS.map(c => `<button type="button" class="hub-btn sw${(te.color || '') === c ? ' on' : ''}" data-act="tag-color" data-c="${c}" style="background:${c || 'transparent'}" aria-label="${c || t('tag_nocolor')}"></button>`).join('')}</div>
            <div class="acts"><button type="button" class="hub-btn hub-ge-del${te.del ? ' armed' : ''}" data-act="tag-del" style="height:34px;font-size:15px">${esc(te.del ? t('tag_del_sure') : t('tag_del'))}</button><span style="flex:1"></span>
            <button type="button" class="hub-btn hub-plain" data-act="tag-edit-cancel" style="height:34px;color:#3a1a14;border-color:#a8844f">${esc(t('cancel'))}</button>
            <button type="button" class="hub-btn hub-red" data-act="tag-save" style="height:34px">${esc(t('save'))}</button></div></div>`;
        return `<div class="hub-tagline"><button type="button" class="hub-btn hub-tagrow${id === cur ? ' on' : ''}" data-act="tag-pick" data-pop="${popKey}" data-tag="${esc(id)}" role="option" aria-selected="${id === cur}">
            <span class="gem" style="background:${color || '#c6a15b'}"></span><span class="nm">${esc(name)}</span>${n !== null ? `<span class="n">${n}</span>` : ''}</button>
            ${id && popKey === 'tags' ? `<button type="button" class="hub-btn pen eye${settings.showcase.includes(id) ? ' on' : ''}" data-act="showcase" data-tag="${esc(id)}" title="${esc(t('showcase_tip'))}" aria-pressed="${settings.showcase.includes(id)}">${ico(settings.showcase.includes(id) ? I.eye : I.eyeDim, 16, settings.showcase.includes(id) ? '#8f1d2c' : '#a8906c', 1.8)}</button>` : ''}
            ${id && popKey === 'tags' ? `<button type="button" class="hub-btn pen" data-act="tag-edit" data-tag="${esc(id)}" title="${esc(t('tag_rename'))}" aria-label="${esc(t('tag_rename'))}">${ico(I.edit, 15, '#6b4a2c')}</button>` : ''}</div>`;
    };
    return `<div class="hub-pop hub-paper" role="listbox" style="left:${left}px">
        <div class="hub-inner"></div>
        ${row('', t('all_tags'), '', null)}
        ${list.map(tg => row(tg.id, tg.name, tg.color, tg.n)).join('')}
        ${popKey === 'tags' ? `<div class="newtag"><input type="text" data-act="tag-new-name" maxlength="60" placeholder="${esc(t('tag_new_ph'))}"><button type="button" class="hub-btn hub-sq lt" data-act="tag-new" data-only="1" title="${esc(t('tag_new'))}" aria-label="${esc(t('tag_new'))}">${ico(I.plus, 18, '#3a1a14')}</button></div>` : ''}
    </div>`;
}

/* ============================================================ GROUPS: create, edit, delete
   Through SillyTavern's own endpoints and its own editGroup, so its lists stay in step. */
const PARTY_PER = 14;
function renderParty() {
    const ge = view.ge;
    if (!ge) return '';
    const ctx = getContext();
    const chars = ctx.characters || [];
    const tagMap = ctx.tagMap || {};
    const q = nkey(ge.q);
    const pool = chars.filter(c => (!ge.tag || (tagMap[c.avatar] || []).includes(ge.tag)) && (!q || nkey(c.name).includes(q)))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const pages = Math.max(1, Math.ceil(pool.length / PARTY_PER));
    ge.page = Math.max(0, Math.min(pages - 1, ge.page || 0));
    const shown = pool.slice(ge.page * PARTY_PER, ge.page * PARTY_PER + PARTY_PER);
    const on = new Set(ge.members);
    const members = ge.members.map(a => chars.find(c => c.avatar === a)).filter(Boolean);
    const slotsN = Math.max(5, members.length + 1);
    const small = slotsN > 8;
    const slots = Array.from({ length: slotsN }, (_, i) => {
        const c = members[i];
        if (!c) return `<div class="hub-slot-e${small ? ' sm' : ''}">${suitSvg(SUITS[i % 4], 26, 'rgba(198,161,91,.45)')}</div>`;
        return `<button type="button" class="hub-btn hub-slot-f${small ? ' sm' : ''}" data-act="ge-toggle" data-av="${esc(c.avatar)}" title="${esc(c.name)}" aria-label="${esc(c.name)}">
            ${img(thumbUrl(c.avatar), '', c.name)}<span class="nm">${esc(c.name)}</span><span class="rm">${ico(I.x, 14, '#ffe2a8', 2.4)}</span></button>`;
    }).join('');
    const cards = shown.map((c, i) => {
        const idx = chars.indexOf(c);
        const suit = SUITS[idx % 4], col = suit === 'heart' || suit === 'diamond' ? '#8f1d2c' : '#1b1418';
        return `<button type="button" class="hub-btn hub-mini${on.has(c.avatar) ? ' on' : ''}" data-act="ge-toggle" data-av="${esc(c.avatar)}" aria-pressed="${on.has(c.avatar)}" title="${esc(c.name)}" style="animation-delay:${(i * 0.03).toFixed(2)}s">
            <span class="idx" style="color:${col}">${RANKS[idx % 4]}${suitSvg(suit, 12, col)}</span>
            <span class="pic">${img(thumbUrl(c.avatar), '', c.name)}</span>
            <span class="nm">${esc(c.name)}</span>
            <span class="seal">${ico('<path d="M5 12l5 5 9-10"></path>', 18, '#ffe2a8', 3)}</span></button>`;
    }).join('');
    return `
    <button type="button" class="hub-btn hub-back" data-act="party-back">${ico(I.left, 18, '#c6a15b', 2)}${esc(view.partyFrom === 'group' ? t('back_group') : t('back_deck'))}</button>
    ${closeBtns()}
    <div class="hub-party-head">
        <div class="kicker">${esc(ge.id ? t('edit_group') : t('new_group'))}</div>
        <div class="banner hub-ribbon"><input type="text" data-act="ge-name" maxlength="80" placeholder="${esc(t('group_name_ph'))}" value="${esc(ge.name)}" aria-label="${esc(t('group_name_ph'))}"></div>
    </div>
    <div class="hub-slots-row">${slots}</div>
    <div class="hub-party-tools">
        <span class="line"></span>
        <span class="lbl">${esc(t('party_pick'))}</span>
        ${tagButton(ge.tag, 'ge-tags')}
        <input class="hub-field" type="search" data-act="ge-q" maxlength="60" placeholder="${esc(t('search'))}" aria-label="${esc(t('search'))}" value="${esc(ge.q)}">
        <span class="line"></span>
    </div>
    ${tagPopover(ge.tag, 'ge-tags', 560)}
    <div class="hub-roster">${shown.length ? cards : `<div class="hub-deck-empty" style="position:static">${esc(t('nobody'))}</div>`}</div>
    ${pages > 1 ? `
    <button type="button" class="hub-btn hub-arrow l" data-act="ge-page" data-dir="-1" style="top:560px;left:70px" aria-label="${esc(t('prev'))}" ${ge.page > 0 ? '' : 'disabled'}>${ico(I.left, 30, '#e8c882', 2)}</button>
    <button type="button" class="hub-btn hub-arrow r" data-act="ge-page" data-dir="1" style="top:560px;right:70px" aria-label="${esc(t('next'))}" ${ge.page < pages - 1 ? '' : 'disabled'}>${ico(I.right, 30, '#e8c882', 2)}</button>` : ''}
    <div class="hub-party-foot">
        <span class="cnt" data-ge-count>${esc(t('picked_n', { n: ge.members.length }))}${pages > 1 ? ` · ${ge.page + 1} / ${pages}` : ''}</span>
        ${ge.id ? `<button type="button" class="hub-btn hub-ge-del${ge.del ? ' armed' : ''}" data-act="ge-delete">${esc(ge.del ? t('delete_sure') : t('delete_group'))}</button>` : ''}
        <button type="button" class="hub-btn hub-plain" data-act="party-back">${esc(t('cancel'))}</button>
        <button type="button" class="hub-btn hub-wax" data-act="ge-save" aria-label="${esc(ge.id ? t('save') : t('create_group'))}">
            <span class="disc">${ico(I.group, 30, '#ffe2a8', 1.8)}</span><span class="cap">${esc(ge.id ? t('save') : t('create_group'))}</span></button>
    </div>`;
}
function openGroupEditor(id) {
    const g = id ? (getContext().groups || []).find(x => x.id === id) : null;
    const base = { page: 0, q: '', tag: '', del: false };
    view.ge = g ? Object.assign(base, { id: g.id, name: String(g.name || ''), members: (g.members || []).slice() }) : Object.assign(base, { id: null, name: '', members: [] });
    view.partyFrom = view.screen === 'group' ? 'group' : 'deck';
    view.panel = null; view.pop = null;
    view.screen = 'party';
    render();
}
function leaveParty() {
    view.screen = view.partyFrom === 'group' && view.ge && view.ge.id ? 'group' : 'deck';
    view.ge = null; view.pop = null;
    render();
}
let geBusy = false;
async function saveGroupEditor() {
    const ge = view.ge;
    if (!ge || geBusy) return;
    const ctx = getContext();
    const chars = ctx.characters || [];
    const members = ge.members.filter(a => chars.some(c => c.avatar === a));
    if (!members.length) { toast(t('need_member')); return; }
    const name = String(ge.name || '').trim().slice(0, 80) || t('group_default', { names: members.map(a => chars.find(c => c.avatar === a).name).join(', ') }).slice(0, 80);
    geBusy = true;
    try {
        if (ge.id) {
            const g = (ctx.groups || []).find(x => x.id === ge.id);
            if (!g) throw new Error('group is gone');
            g.name = name;
            g.members = members;
            if (Array.isArray(g.disabled_members)) g.disabled_members = g.disabled_members.filter(a => members.includes(a));
            await editGroup(g.id, true, true);
            view.ge = null;
            view.group = g.id; view.screen = 'group';
            render();
            toast(t('group_saved'));
        } else {
            const chatName = typeof ctx.humanizedDateTime === 'function' ? ctx.humanizedDateTime() : String(Date.now());
            const r = await fetch('/api/groups/create', {
                method: 'POST', headers: getRequestHeaders(),
                body: JSON.stringify({ name, members, avatar_url: '', allow_self_responses: false, activation_strategy: 0, generation_mode: 0, disabled_members: [], fav: false, chat_id: chatName, chats: [chatName], auto_mode_delay: 5 }),
            });
            if (!r.ok) throw new Error('create ' + r.status);
            const data = await r.json();
            await getContext().getCharacters();
            view.ge = null;
            if (data && data.id) { view.group = String(data.id); view.gsel = null; view.screen = 'group'; }
            render();
            toast(t('group_created', { name }));
        }
    } catch (e) {
        console.error('[Tavern Suite Menu] group save', e);
        toast(t('save_failed'));
    } finally { geBusy = false; }
}
async function deleteFromEditor() {
    const ge = view.ge;
    if (!ge || !ge.id || geBusy) return;
    const ctx = getContext();
    if (ctx.groupId === ge.id) { toast(t('cant_delete_open')); return; }
    if (!ge.del) { ge.del = true; render(); return; }   // the second click deletes
    const g = (ctx.groups || []).find(x => x.id === ge.id);
    geBusy = true;
    try {
        const r = await fetch('/api/groups/delete', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ id: ge.id }) });
        if (!r.ok) throw new Error('delete ' + r.status);
        // as SillyTavern does it: the other extensions hear that these chats are gone
        if (g && Array.isArray(g.chats)) for (const c of g.chats) { try { await eventSource.emit(event_types.GROUP_CHAT_DELETED, c); } catch (e) { /* a listener failed */ } }
        try { if (ctx.tagMap) delete ctx.tagMap[ge.id]; } catch (e) { /* ignore */ }
        await getContext().getCharacters();
        view.ge = null; view.group = null;
        view.screen = 'deck';
        render();
        toast(t('group_deleted'));
    } catch (e) {
        console.error('[Tavern Suite Menu] group delete', e);
        toast(t('save_failed'));
    } finally { geBusy = false; }
}

/* ============================================================ WHAT THE MENU SHOWS
   Hiding is the menu's own: nothing is deleted or changed in SillyTavern. */
const keyOfEnt = e => e ? (e.kind === 'group' ? 'g:' + e.g.id : 'c:' + e.ch.avatar) : '';
function tagsOfKey(key) {
    const map = getContext().tagMap || {};
    return map[String(key).slice(2)] || [];
}
function isShown(key) {
    if (!key || settings.hidden.includes(key)) return false;
    if (!settings.showcase.length) return true;
    const live = settings.showcase.filter(id => (getContext().tags || []).some(t0 => t0.id === id));
    if (!live.length) return true;            // the showcased tags were deleted: show everything
    return tagsOfKey(key).some(id => live.includes(id));
}
const recShown = r => { const e = entityOf(r); return !!e && isShown(keyOfEnt(e)); };

/* ============================================================ DECK */
function deckEntities() {
    const ctx = getContext();
    const tagMap = ctx.tagMap || {};
    const chars = (ctx.characters || []).map((c, i) => ({ kind: 'char', key: 'c:' + c.avatar, name: String(c.name || ''), ch: c, idx: i, fav: c.fav === true || c.fav === 'true', last: Number(c.date_last_chat) || 0, chat: c.chat ? String(c.chat) : null, tags: tagMap[c.avatar] || [] }));
    const groups = (ctx.groups || []).map(g => ({ kind: 'group', key: 'g:' + g.id, name: String(g.name || ''), g, fav: g.fav === true || g.fav === 'true', last: Number(g.date_last_chat) || 0, chat: g.chat_id ? String(g.chat_id) : null, tags: tagMap[g.id] || [] }));
    return chars.concat(groups);
}
function deckList() {
    const d = view.deck;
    let list = deckEntities();
    if (d.tab === 'hidden') list = list.filter(e => settings.hidden.includes(e.key));
    else list = list.filter(e => isShown(e.key));
    if (d.tab === 'fav') list = list.filter(e => e.fav);
    if (d.tab === 'groups') list = list.filter(e => e.kind === 'group');
    if (d.tag) list = list.filter(e => e.tags.includes(d.tag));
    const q = nkey(d.q);
    if (q) list = list.filter(e => nkey(e.name).includes(q));
    if (d.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else list.sort((a, b) => (b.last - a.last) || a.name.localeCompare(b.name));
    return list;
}
function entityInfo(e) {
    const ms = mapStateOf(e.chat), dy = diaryOf(e.chat);
    if (e.kind === 'group') {
        const mem = membersOf(e.g);
        return { role: t('group_n', { n: mem.length }), where: '', members: mem };
    }
    const npc = npcOf(dy, e.name);
    return { role: (npc && npc.role) || '', where: whereText(whereOf(ms, e.name)) };
}
function renderDeck() {
    const d = view.deck;
    const ctx = getContext();
    const list = deckList();
    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    if (d.page > pages - 1) d.page = pages - 1;
    if (d.page < 0) d.page = 0;
    const shown = list.slice(d.page * PER_PAGE, d.page * PER_PAGE + PER_PAGE);
    if (!shown.some(e => e.key === d.sel)) d.sel = shown[0] ? shown[0].key : null;
    const chosen = list.find(e => e.key === d.sel) || null;
    const offsets = [30, 0, 50, 14];
    const chains = [26, 12, 32, 18];
    const cards = shown.map((e, i) => {
        const inf = entityInfo(e);
        const suit = SUITS[(e.kind === 'char' ? e.idx : i) % 4];
        const sel = e.key === d.sel;
        let art;
        if (e.kind === 'group' && groupPicture(e.g)) art = img(groupPicture(e.g), '', e.name);
        else if (e.kind === 'group') {
            const mem = inf.members.slice(0, 4);
            art = mem.length ? mem.map((c, k) => `<div class="slice" style="left:${(k * 100 / mem.length).toFixed(3)}%;width:${(100 / mem.length).toFixed(3)}%;${k ? 'border-left:2px solid #c6a15b' : ''}">${img(thumbUrl(c.avatar), '', c.name)}</div>`).join('') : SILHOUETTE;
        } else art = img(avatarUrl(e.ch.avatar), '', e.name) || SILHOUETTE;
        return `<button type="button" class="hub-btn hub-card" data-act="sel" data-key="${esc(e.key)}" aria-pressed="${sel}" aria-label="${esc(e.name)}" style="margin-top:${offsets[i % 4]}px;animation-delay:${(-1.2 * i).toFixed(1)}s">
            <svg width="20" height="${chains[i % 4]}" viewBox="0 0 20 140" preserveAspectRatio="none" aria-hidden="true" style="position:absolute;left:50%;margin-left:-10px;bottom:100%"><defs><pattern id="hubLink${i}" width="20" height="18" patternUnits="userSpaceOnUse"><ellipse cx="10" cy="9" rx="4.5" ry="8" stroke="#c6a15b" stroke-opacity="0.7" stroke-width="2" fill="none"></ellipse></pattern></defs><rect width="20" height="140" fill="url(#hubLink${i})"></rect></svg>
            <svg width="190" height="40" viewBox="0 0 190 40" aria-hidden="true" style="position:absolute;left:0;top:-24px;z-index:1"><path d="M95 2 C82 2 76 14 70 20 C78 18 86 22 95 34 C104 22 112 18 120 20 C114 14 108 2 95 2 Z" fill="#c6a15b"></path><path d="M60 26 C70 22 78 26 95 36 C112 26 120 22 130 26" stroke="#c6a15b" stroke-width="2" fill="none"></path><circle cx="95" cy="16" r="3" fill="#8f1d2c"></circle></svg>
            <div class="art">${art}
            <div class="info">
                ${suitSvg(e.kind === 'group' ? 'club' : suit, 22, e.kind === 'group' ? '#e8c882' : '#e9dfcc')}
                <div class="nm">${esc(e.name)}</div>
                ${inf.role ? `<div class="role">${esc(inf.role)}</div>` : ''}
                ${inf.where ? `<div class="wh">${esc(inf.where)}</div>` : ''}
            </div></div>
            <svg width="190" height="480" viewBox="0 0 190 480" fill="none" aria-hidden="true" style="position:absolute;inset:0"><path d="M5 5 H185 V434 L95 474 L5 434 Z" stroke="#e8c882" stroke-width="3.2" stroke-dasharray="0 9" stroke-linecap="round"></path><path d="M13 13 H177 V429 L95 465 L13 429 Z" stroke="#c6a15b" stroke-opacity="0.35" stroke-width="1"></path><path d="M2 30 C2 12 12 2 30 2 M14 22 C14 16 18 12 24 12" stroke="#c6a15b" stroke-width="2"></path><path d="M188 30 C188 12 178 2 160 2 M176 22 C176 16 172 12 166 12" stroke="#c6a15b" stroke-width="2"></path><circle cx="95" cy="474" r="4" fill="#e8c882"></circle></svg>
            ${e.fav ? `<span class="fav">${suitSvg('heart', 20, '#c03a4b')}</span>` : ''}
            <div class="shine"></div>
            ${sel ? '<svg class="sel" width="206" height="496" viewBox="0 0 206 496" fill="none" aria-hidden="true"><path d="M6 6 H200 V442 L103 490 L6 442 Z" stroke="#ffe2a8" stroke-width="2"></path><path d="M6 6 H200 V442 L103 490 L6 442 Z" stroke="#c03a4b" stroke-opacity="0.6" stroke-width="10" style="filter:blur(6px)"></path></svg>' : ''}
        </button>`;
    }).join('');
    const tab = (id, label, icon) => `<button type="button" class="hub-btn hub-tab${d.tab === id ? ' on' : ''}" data-act="tab" data-tab="${id}">${suitSvg(icon, 16, d.tab === id ? '#e8c882' : '#c6a15b')}${esc(label)}</button>`;
    let plaque = '';
    if (chosen) {
        const inf = entityInfo(chosen);
        const info = chosen.kind === 'group' ? inf.members.map(c => c.name).join(' · ') : [inf.role, inf.where].filter(Boolean).join(' · ');
        plaque = `<div class="hub-plaque">
            ${suitSvg(chosen.kind === 'group' ? 'club' : SUITS[chosen.idx % 4], 22, chosen.kind === 'group' ? '#e8c882' : '#e9dfcc')}
            <span class="nm">${esc(chosen.name)}</span>
            <span class="inf">${esc(info)}</span>
            <button type="button" class="hub-btn hub-sq${settings.hidden.includes(chosen.key) ? ' on' : ''}" data-act="hide" data-key="${esc(chosen.key)}" title="${esc(settings.hidden.includes(chosen.key) ? t('unhide') : t('hide'))}" aria-label="${esc(settings.hidden.includes(chosen.key) ? t('unhide') : t('hide'))}" style="width:44px;height:44px">${ico(settings.hidden.includes(chosen.key) ? I.eye : I.eyeOff, 20)}</button>
            <button type="button" class="hub-btn hub-sq" data-act="pop" data-pop="assign" title="${esc(t('tags'))}" aria-label="${esc(t('tags'))}" style="width:44px;height:44px">${ico(I.tag, 20)}</button>
            <button type="button" class="hub-btn hub-plain" data-act="start" data-key="${esc(chosen.key)}">${esc(chosen.kind === 'group' ? t('group_chat') : t('start_chat'))}</button>
            <button type="button" class="hub-btn hub-red" data-act="${chosen.kind === 'group' ? 'open-group' : 'open-dossier'}" data-key="${esc(chosen.key)}">${esc(t('open_dossier'))}</button>
        </div>`;
    }
    view.deckEnt = chosen ? (chosen.kind === 'group' ? { kind: 'group', g: chosen.g } : { kind: 'char', ch: chosen.ch, idx: chosen.idx }) : null;
    return `
    <button type="button" class="hub-btn hub-back" data-act="home">${ico(I.left, 18, '#c6a15b', 2)}${esc(t('back_menu'))}</button>
    ${tagAssignPopover(view.deckEnt)}
    <div class="hub-toolbar">
        ${tab('all', t('all'), 'diamond')}${tab('fav', t('fav'), 'heart')}${tab('groups', t('groups'), 'club')}${settings.hidden.length || d.tab === 'hidden' ? `<button type="button" class="hub-btn hub-tab${d.tab === 'hidden' ? ' on' : ''}" data-act="tab" data-tab="hidden" title="${esc(t('hidden_tab', { n: settings.hidden.length }))}" aria-label="${esc(t('hidden_tab', { n: settings.hidden.length }))}">${ico(I.eyeOff, 16, d.tab === 'hidden' ? '#e8c882' : '#c6a15b', 1.8)}${settings.hidden.length}</button>` : ''}
        ${settings.showcase.length ? `<button type="button" class="hub-btn hub-showcase" data-act="showcase-clear" title="${esc(t('showcase_clear'))}">${ico(I.eye, 16, '#ffe2a8', 1.8)}<span class="hub-ell">${esc(t('showcase_only', { names: tagList().filter(x => settings.showcase.includes(x.id)).map(x => x.name).join(', ') || '—' }))}</span>${ico(I.x, 14, '#ffe2a8', 2.2)}</button>` : ''}
        ${tagButton(d.tag, 'tags')}
        <button type="button" class="hub-btn hub-tab" data-act="sort-toggle" title="${esc(t('sort_switch'))}">${ico(d.sort === 'name' ? '<path d="M4 6h10M4 12h7M4 18h4M17 5v14M14 16l3 3 3-3"></path>' : I.clock, 16, '#c6a15b', 1.8)}${esc(d.sort === 'name' ? t('sort_name') : t('sort_recent'))}</button>
        <input class="hub-field" type="search" data-act="q" placeholder="${esc(t('search'))}" aria-label="${esc(t('search'))}" value="${esc(d.q)}" maxlength="60">
        <span style="flex:1;min-width:8px"></span>
        <button type="button" class="hub-btn hub-sq" data-act="new-group" title="${esc(t('new_group'))}" aria-label="${esc(t('new_group'))}">${ico(I.group, 22)}</button>
        <button type="button" class="hub-btn hub-sq" data-act="create" title="${esc(t('create'))}" aria-label="${esc(t('create'))}">${ico(I.plus, 22)}</button>
        <button type="button" class="hub-btn hub-sq" data-act="import" title="${esc(t('import'))}" aria-label="${esc(t('import'))}">${ico(I.imp, 22)}</button>
    </div>
    ${closeBtns()}
    ${tagPopover(d.tag, 'tags', 560)}
    <div class="hub-mist"></div>
    ${shown.length ? `<div class="hub-row-cards">${cards}</div>` : `<div class="hub-deck-empty">${esc(t('nobody'))}</div>`}
    ${pages > 1 ? `
    <button type="button" class="hub-btn hub-arrow l" data-act="page" data-dir="-1" aria-label="${esc(t('prev'))}" ${d.page > 0 ? '' : 'disabled'}>${ico(I.left, 30, '#e8c882', 2)}</button>
    <button type="button" class="hub-btn hub-arrow r" data-act="page" data-dir="1" aria-label="${esc(t('next'))}" ${d.page < pages - 1 ? '' : 'disabled'}>${ico(I.right, 30, '#e8c882', 2)}</button>` : ''}
    <div class="hub-dots">${pages > 1 && pages <= 24 ? Array.from({ length: pages }, (_, n) => `<button type="button" class="hub-btn hub-dot${n === d.page ? ' on' : ''}" data-act="goto" data-n="${n}" aria-label="${esc(t('page', { n: n + 1 }))}"></button>`).join('') : ''}
        <span style="font-size:14px;letter-spacing:0.14em;color:#b9ab98;margin-left:6px">${esc(t('page_of', { p: d.page + 1, n: pages, c: list.length }))}</span></div>
    ${plaque}`;
}

/* ============================================================ DOSSIER */
function renderDossier() {
    const ctx = getContext();
    const idx = (ctx.characters || []).findIndex(c => c.avatar === view.dossier);
    const ch = ctx.characters[idx];
    if (!ch) return `<button type="button" class="hub-btn hub-back" data-act="deck">${ico(I.left, 18, '#c6a15b', 2)}${esc(t('back_deck'))}</button>${closeBtns()}`;
    // the chat this card was played in last: the open one if it is theirs
    const live = liveEntity();
    const chatId = live && live.kind === 'char' && live.ch.avatar === ch.avatar ? ctx.chatId : (ch.chat || null);
    const ms = mapStateOf(chatId), dy = diaryOf(chatId);
    const npc = npcOf(dy, ch.name);
    const snap = chatId ? settings.snaps[chatId] : null;
    const suit = SUITS[idx % 4], rank = RANKS[idx % 4];
    const red = suit === 'heart' || suit === 'diamond';
    const trust = npc && typeof npc.trust === 'number' ? Math.max(0, Math.min(100, Math.round(npc.trust))) : null;
    const w = whereOf(ms, ch.name);
    const fields = [];
    if (npc && npc.role) fields.push([t('f_role'), npc.role]);
    if (npc && npc.met) fields.push([t('f_met'), npc.met]);
    if (npc && npc.look) fields.push([t('f_look'), npc.look]);
    if (npc && npc.note) fields.push([t('f_note'), npc.note]);
    if (w) fields.push([t('f_where'), whereText(w) + (w.doing ? ` — ${w.doing}` : '')]);
    if (!npc) { const card = macros(plain(ch.personality || ch.description || ''), ch.name); if (card) fields.push([t('f_card'), clip(card, 320)]); }
    if (ch.date_last_chat) fields.push([t('f_last'), fmtDate(ch.date_last_chat)]);
    const quote = snap && snap.line && (!snap.group) && (same(snap.speaker, ch.name) || !snap.speaker) ? speechLines(snap.line)[0] || clip(snap.line, 260) : '';
    const pins = chronicleOf(ms, ch.name).slice(0, 3);
    const r = routineOf(ms, ch.name);
    const hasWeekend = !!(r && r.weekend && DAY_PARTS.some(p => r.weekend[p] && r.weekend[p].kind));
    const src = view.week && hasWeekend ? r.weekend : r;
    const part = ms && DAY_PARTS.includes(ms.lastPart) ? ms.lastPart : null;
    const partIdx = part ? DAY_PARTS.indexOf(part) : -1;
    const slots = r ? DAY_PARTS.map(p => [p, slotText(src && src[p])]).filter(x => x[1]) : [];
    const sector = (i, col) => { const a0 = (i * 90 - 90) * Math.PI / 180, a1 = ((i + 1) * 90 - 90) * Math.PI / 180, R = 130; return `<path d="M150 150 L${(150 + R * Math.cos(a0)).toFixed(1)} ${(150 + R * Math.sin(a0)).toFixed(1)} A${R} ${R} 0 0 1 ${(150 + R * Math.cos(a1)).toFixed(1)} ${(150 + R * Math.sin(a1)).toFixed(1)} Z" fill="${col}"></path>`; };
    const sectorCols = ['rgba(232,200,130,.16)', 'rgba(232,200,130,.08)', 'rgba(143,29,44,.18)', 'rgba(20,12,30,.5)'];
    return `
    <button type="button" class="hub-btn hub-back" data-act="deck">${ico(I.left, 18, '#c6a15b', 2)}${esc(t('back_deck'))}</button>
    ${closeBtns()}
    <div class="hub-ds-card">
        <div class="face">
            <div class="idx" style="left:14px;top:10px;color:${red ? '#8f1d2c' : '#1b1418'}">${rank}${suitSvg(suit, 18, red ? '#8f1d2c' : '#1b1418')}</div>
            <div class="idx" style="right:14px;bottom:10px;transform:rotate(180deg);color:${red ? '#8f1d2c' : '#1b1418'}">${rank}${suitSvg(suit, 18, red ? '#8f1d2c' : '#1b1418')}</div>
            <div class="pic">${img(avatarUrl(ch.avatar), '', ch.name)}</div>
        </div>
    </div>
    <div class="hub-ds-name">
        <h1 style="${nameFit(ch.name)}" title="${esc(ch.name)}">${esc(ch.name)}</h1>
        ${npc && npc.role ? `<div style="font-size:19px;font-style:italic;color:#cbbca4">${esc(clip(npc.role, 80))}</div>` : ''}
        ${trust !== null ? `<div class="hub-hearts" title="${esc(t('trust', { n: trust }))}">${Array.from({ length: 5 }, (_, i) => i < Math.round(trust / 20) ? HEART_ON : HEART_OFF).join('')}<span style="font-size:15px;color:#cbbca4;margin-left:6px">${esc(t('trust', { n: trust }))}</span></div>` : ''}
    </div>
    <div class="hub-file hub-paper">
        <div class="hd">
            <div><div class="no">${esc(t('case_no', { n: idx + 1 }))}</div><div class="tt">${esc(clip(ch.name, 30))}</div></div>
            <span class="hub-stamp" style="font-family:var(--f-body)">${esc(t('secret'))}</span>
        </div>
        ${fields.map(([k, v]) => `<div class="fld"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('')}
        ${quote ? `<div class="hub-quote"><div class="t">${esc(quote)}</div><small>${esc(t('testimony'))}</small></div>` : ''}
        ${pins.length ? `<div class="hub-pins">${pins.map(p => `<div class="hub-pin">${p.when ? `<div class="w">${esc(p.when)}</div>` : ''}<div class="tx">${esc(p.text)}</div></div>`).join('')}</div>` : ''}
    </div>
    <div class="hub-day">
        <div style="font-family:var(--f-title);font-size:28px;color:#f2e5cb;text-align:center">${esc(t('one_day'))}</div>
        <div class="hub-watch">
            <svg width="300" height="300" viewBox="0 0 300 300" aria-hidden="true">
                <circle cx="150" cy="150" r="146" fill="#140c12" stroke="#c6a15b" stroke-width="3"></circle>
                <circle cx="150" cy="150" r="136" fill="none" stroke="#c6a15b" stroke-opacity=".4" stroke-dasharray="2 5"></circle>
                ${DAY_PARTS.map((p, i) => sector(i, i === partIdx ? 'rgba(192,58,75,.45)' : sectorCols[i])).join('')}
                ${DAY_PARTS.map((p, i) => { const a = (i * 90 - 45) * Math.PI / 180; return `<text x="${(150 + 92 * Math.cos(a)).toFixed(1)}" y="${(150 + 92 * Math.sin(a) + 5).toFixed(1)}" text-anchor="middle" font-family="RPGHub Playfair, serif" font-size="15" fill="${i === partIdx ? '#fff3da' : '#cbbca4'}">${esc(t('part_' + p))}</text>`; }).join('')}
                <circle cx="150" cy="150" r="10" fill="#c6a15b"></circle>
            </svg>
            ${partIdx >= 0 ? `<div class="hand" style="transform:rotate(${partIdx * 90 + 45}deg)"></div>` : ''}
            <div class="hub-tick"></div>
        </div>
        ${hasWeekend ? `<div class="hub-week"><button type="button" class="hub-btn hub-tab${view.week ? '' : ' on'}" data-act="week" data-w="0">${esc(t('weekdays'))}</button><button type="button" class="hub-btn hub-tab${view.week ? ' on' : ''}" data-act="week" data-w="1">${esc(t('weekend'))}</button></div>` : ''}
        <div class="hub-slots">${slots.length ? slots.map(([p, v]) => `<div class="hub-slot${p === part ? ' now' : ''}"><span class="p">${esc(t('part_' + p))}</span><span class="v">${esc(v)}</span></div>`).join('') : `<div class="hub-slot"><span class="v hub-dim" style="font-style:italic">${esc(t('no_routine'))}</span></div>`}</div>
        <div class="hub-nowbox"><div class="k">${esc(t('now'))}</div><div class="v">${esc(whereText(w) || t('unknown'))}</div></div>
    </div>
    <div class="hub-ds-actions"><button type="button" class="hub-btn hub-red" data-act="start" data-key="${esc('c:' + ch.avatar)}">${esc(t('start_chat'))}</button>
        <button type="button" class="hub-btn hub-sq" data-act="ce-edit" title="${esc(t('ce_edit'))}" aria-label="${esc(t('ce_edit'))}" style="width:44px;height:44px">${ico(I.edit, 20)}</button>
        ${view.dpics && view.dpics.length > 1 ? `<button type="button" class="hub-btn hub-sq" data-act="ds-bg" title="${esc(t('other_bg'))}" aria-label="${esc(t('other_bg'))}" style="width:44px;height:44px">${ico(I.dice, 22)}</button>` : ''}</div>`;
}

/* opening a dossier: their room comes with it */
async function openDossier(avatar) {
    view.dossier = avatar; view.week = false; view.dpics = [];
    view.screen = 'dossier';
    render();
    const ctx = getContext();
    const ch = (ctx.characters || []).find(c => c.avatar === avatar);
    if (!ch) return;
    const live = liveEntity();
    const chatId = live && live.kind === 'char' && live.ch.avatar === ch.avatar ? ctx.chatId : (ch.chat || null);
    const ms = mapStateOf(chatId);
    view.dpics = roomsOf(ms).filter(r => hasPicture(r.sub));
    const here = hereRoom(ms);
    const pick = settings.bg === 'scene' && here && hasPicture(here.sub) ? here : view.dpics[Math.floor(Math.random() * view.dpics.length)];
    if (pick && settings.bg !== 'st') { const u = await roomPicture(pick.sub); if (u && isOpen && view.dossier === avatar && view.screen === 'dossier') setBackground(u); }
    if (isOpen && view.dossier === avatar && view.screen === 'dossier') render();
}

/* ============================================================ CHARACTERS — create, edit, delete
   Through SillyTavern's own endpoints; its list is refreshed after every change. */
/* The card's fields, as SillyTavern names them, grouped the way a character sheet reads. */
const CE_TEXT = ['description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes', 'system_prompt', 'post_history_instructions', 'creator', 'character_version', 'depth_prompt'];
const DEPTH_ROLES = ['system', 'user', 'assistant'];
function talkOf(v) { const n = Number(v); return v === undefined || v === null || v === '' || !Number.isFinite(n) ? 0.5 : Math.max(0, Math.min(1, n)); }
function openCharEdit(avatar) {
    const ch = avatar ? (getContext().characters || []).find(c => c.avatar === avatar) : null;
    const d = (ch && ch.data) || {};
    const ext = d.extensions || {};
    const dp = ext.depth_prompt || {};
    const pick = f => String(d[f] ?? (ch ? ch[f] : '') ?? '');
    view.ce = {
        avatar: ch ? ch.avatar : null, name: ch ? String(ch.name || '') : '',
        fav: ch ? (ch.fav === true || ch.fav === 'true' || ext.fav === true) : false,
        file: null, preview: '', del: false, open: null, just: null,
        f: {
            description: pick('description'), personality: pick('personality'), scenario: pick('scenario'),
            first_mes: pick('first_mes'), mes_example: pick('mes_example'),
            creator_notes: String(d.creator_notes ?? (ch && ch.creatorcomment) ?? ''),
            system_prompt: pick('system_prompt'), post_history_instructions: pick('post_history_instructions'),
            creator: pick('creator'), character_version: pick('character_version'),
            depth_prompt: String(dp.prompt || ''),
        },
        depth: Number.isFinite(Number(dp.depth)) ? Number(dp.depth) : 4,
        role: DEPTH_ROLES.includes(dp.role) ? dp.role : 'system',
        talk: talkOf(ext.talkativeness ?? (ch ? ch.talkativeness : undefined)),
        greetings: Array.isArray(d.alternate_greetings) ? d.alternate_greetings.map(String) : [],
    };
    view.ceFrom = view.screen;
    view.pop = null;
    view.screen = 'char';
    render();
}
function focusFirst(sel) {
    requestAnimationFrame(() => { const f = stageEl && stageEl.querySelector(sel); if (f) { try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } });
}
function ceField(key, label, rows, hint) {
    const v = view.ce.f[key];
    return `<label class="ce-fld${rows ? ' area' : ''}">
        <span class="ce-lbl">${esc(t(label))}${hint ? `<i>${esc(t(hint))}</i>` : ''}<b class="ce-n" data-n="${key}">${v.length || ''}</b></span>
        ${rows ? `<textarea data-act="ce-f" data-f="${key}" rows="${rows}" maxlength="60000" spellcheck="false">${esc(v)}</textarea>` : `<input type="text" data-act="ce-f" data-f="${key}" maxlength="200" value="${esc(v)}" spellcheck="false">`}
    </label>`;
}
/* ---- a file of loose papers: each one is picked up to be written on ---- */
const QUILL = '<path d="M20 4c-6 0-11 5-13 11l-2 5 5-2c6-2 11-7 11-13z"></path><path d="M7 15l5-5"></path>';
const ICO_SEAL = '<path d="M6 12l4 4 8-9"></path>';
const SLIP_ICON = {
    look: I.eye,
    soul: '<path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6-8 11-8 11z"></path>',
    voice: '<path d="M4 5h16v11H9l-5 4z"></path>',
    ai: '<rect x="5" y="10" width="14" height="10" rx="1"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path>',
    notes: '<path d="M6 3h9l4 4v14H6z"></path><path d="M14 3v5h5M9 13h7M9 17h5"></path>',
    about: I.eye,
    prompt: '<path d="M4 6h16M4 12h10M4 18h7"></path>',
    lore: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"></path><path d="M5 17a3 3 0 0 1 3-3h11"></path>',
};
function fsSlip(key, act, cls, title, filled, body, empty, count, style) {
    const just = (view.ce && view.ce.just === key) || (view.yedit && view.yedit.just === key);
    return `<button type="button" class="hub-btn fs-slip ${cls}${filled ? ' filled' : ''}${just ? ' just' : ''}" data-act="${act}" data-slip="${key}" style="${style || ''}">
        <span class="fs-hd">${ico(SLIP_ICON[key] || QUILL, 18, 'currentColor', 1.8)}<b>${esc(title)}</b>${count ? `<i>${esc(count)}</i>` : ''}</span>
        <span class="fs-body">${filled ? body : `<span class="fs-empty">${esc(empty)}</span>`}</span>
        <span class="fs-seal">${ico(ICO_SEAL, 16, '#ffe2a8', 3)}</span>
        <span class="fs-pen">${ico(QUILL, 18, '#ffe2a8', 1.8)}<span>${esc(t(filled ? 'fs_edit' : 'fs_fill'))}</span></span>
    </button>`;
}
function fsOverlay(key, closeAct, title, ask, inner) {
    return `<div class="fs-veil" data-act="${closeAct}">
        <div class="fs-open hub-paper fs-${key}" data-stop2="1">
            <div class="hub-inner"></div>
            <span class="fs-tape"></span>
            <div class="fs-ohd">${ico(SLIP_ICON[key] || QUILL, 24, '#8f1d2c', 1.8)}<span class="tt">${esc(title)}</span></div>
            <div class="fs-ask">${esc(ask)}</div>
            <div class="fs-obody">${inner}</div>
            <div class="fs-ofoot"><span class="fs-hint">${esc(t('fs_esc'))}</span><span style="flex:1"></span><button type="button" class="hub-btn fs-done" data-act="${closeAct}">${ico(ICO_SEAL, 18, '#ffe2a8', 2.6)}${esc(t('fs_done'))}</button></div>
        </div>
    </div>`;
}
const clipLines = (s0, n) => esc(clip(String(s0 || '').replace(/\s+/g, ' ').trim(), n));
function ceProgress(ce) {
    const f = ce.f;
    const parts = [!!ce.name.trim(), !!(ce.preview || ce.avatar), !!f.description.trim(), !!f.personality.trim(), !!f.scenario.trim(), !!f.first_mes.trim(), !!f.mes_example.trim(), !!f.creator_notes.trim()];
    return Math.round(parts.filter(Boolean).length / parts.length * 100);
}
const CE_SLIP_FILLED = {
    look: ce => !!ce.f.description.trim(),
    soul: ce => !!(ce.f.personality.trim() || ce.f.scenario.trim()),
    voice: ce => !!(ce.f.first_mes.trim() || ce.greetings.some(g => g.trim()) || ce.f.mes_example.trim()),
    ai: ce => !!(ce.f.system_prompt.trim() || ce.f.post_history_instructions.trim() || ce.f.depth_prompt.trim()),
    notes: ce => !!ce.f.creator_notes.trim(),
};
function renderCharEdit() {
    const ce = view.ce;
    if (!ce) return '';
    const pic = ce.preview || (ce.avatar ? avatarUrl(ce.avatar) : '/img/ai4.png');
    const F = ce.f;
    const pct = ceProgress(ce);
    const total = CE_TEXT.reduce((a, k) => a + F[k].length, 0) + ce.greetings.reduce((a, g) => a + g.length, 0);
    const n = k => F[k].length ? t('fs_chars', { n: F[k].length.toLocaleString() }) : '';
    const greets = ce.greetings.filter(g => g.trim()).length;
    const slips = [
        fsSlip('look', 'ce-open', 'parch big', t('ce_t_look'), CE_SLIP_FILLED.look(ce), `<span class="hand">${clipLines(F.description, 420)}</span>`, t('fs_look_e'), n('description'), '--tilt:-1.2deg'),
        fsSlip('soul', 'ce-open', 'torn', t('ce_t_soul'), CE_SLIP_FILLED.soul(ce),
            `${F.personality.trim() ? `<span class="row"><em>${esc(t('ce_pers'))}</em><span class="hand">${clipLines(F.personality, 120)}</span></span>` : ''}${F.scenario.trim() ? `<span class="row"><em>${esc(t('ce_scen'))}</em><span class="hand">${clipLines(F.scenario, 120)}</span></span>` : ''}`,
            t('fs_soul_e'), '', '--tilt:1.6deg'),
        fsSlip('voice', 'ce-open', 'dark', t('ce_t_voice'), CE_SLIP_FILLED.voice(ce),
            `${F.first_mes.trim() ? `<span class="quote">${clipLines(F.first_mes, 220)}</span>` : ''}<span class="meta">${esc(t('ce_greets_n', { n: greets + (F.first_mes.trim() ? 1 : 0) }))}${F.mes_example.trim() ? ' · ' + esc(t('ce_examples')) : ''}</span>`,
            t('fs_voice_e'), '', '--tilt:.8deg'),
        fsSlip('ai', 'ce-open', 'case', t('ce_t_ai'), CE_SLIP_FILLED.ai(ce),
            `<span class="checks">${[['system_prompt', 'ce_sys'], ['post_history_instructions', 'ce_post'], ['depth_prompt', 'ce_note']].map(([k, l]) => `<span class="ck${F[k].trim() ? ' on' : ''}"><i></i>${esc(t(l))}</span>`).join('')}</span>${F.depth_prompt.trim() ? `<span class="meta">${esc(t('ce_depth'))} ${ce.depth} · ${esc(t('ce_role_' + ce.role))}</span>` : ''}`,
            t('fs_ai_e'), '', '--tilt:-.8deg'),
        fsSlip('notes', 'ce-open', 'sticky', t('ce_t_notes'), CE_SLIP_FILLED.notes(ce), `<span class="hand">${clipLines(F.creator_notes, 160)}</span>`, t('fs_notes_e'), '', '--tilt:3deg'),
    ];
    let over = '';
    if (ce.open === 'look') over = fsOverlay('look', 'ce-close', t('ce_desc'), t('fs_look_q'), ceField('description', 'ce_desc', 14).replace('class="ce-fld area"', 'class="ce-fld area grow"'));
    else if (ce.open === 'soul') over = fsOverlay('soul', 'ce-close', t('ce_t_soul'), t('fs_soul_q'), ceField('personality', 'ce_pers', 6).replace('class="ce-fld area"', 'class="ce-fld area grow"') + ceField('scenario', 'ce_scen', 6).replace('class="ce-fld area"', 'class="ce-fld area grow"'));
    else if (ce.open === 'voice') over = fsOverlay('voice', 'ce-close', t('ce_t_voice'), t('fs_voice_q'), ceField('first_mes', 'ce_first', 4).replace('class="ce-fld area"', 'class="ce-fld area grow"') + `
        <div class="ce-fld"><span class="ce-lbl">${esc(t('ce_greets'))}<b class="ce-n">${ce.greetings.length || ''}</b></span>
            <div class="ce-greets">${ce.greetings.map((g, i) => `<div class="ce-greet"><span class="no">${i + 2}</span><textarea data-act="ce-g" data-i="${i}" rows="2" maxlength="60000" spellcheck="false">${esc(g)}</textarea><button type="button" class="hub-btn ce-x" data-act="ce-g-del" data-i="${i}" aria-label="${esc(t('ce_greet_del'))}">${ico(I.x, 14, '#8f1d2c', 2.2)}</button></div>`).join('')}
            <button type="button" class="hub-btn ce-add" data-act="ce-g-add">${ico(I.plus, 16, '#8f1d2c', 2)}${esc(t('ce_greet_add'))}</button></div>
        </div>` + ceField('mes_example', 'ce_examples', 4, 'ce_examples_h').replace('class="ce-fld area"', 'class="ce-fld area grow"'));
    else if (ce.open === 'ai') over = fsOverlay('ai', 'ce-close', t('ce_t_ai'), t('fs_ai_q'), `<div class="ce-two">${ceField('system_prompt', 'ce_sys', 5, 'ce_sys_h')}${ceField('post_history_instructions', 'ce_post', 5, 'ce_post_h')}</div>
        ${ceField('depth_prompt', 'ce_note', 5, 'ce_note_h')}
        <div class="ce-row">
            <div class="ce-fld"><span class="ce-lbl">${esc(t('ce_depth'))}</span><div class="ce-step"><button type="button" class="hub-btn" data-act="ce-depth" data-d="-1" aria-label="−">−</button><b data-n="depth">${ce.depth}</b><button type="button" class="hub-btn" data-act="ce-depth" data-d="1" aria-label="+">+</button></div></div>
            <div class="ce-fld"><span class="ce-lbl">${esc(t('ce_role'))}</span><div class="ce-seg">${DEPTH_ROLES.map(r => `<button type="button" class="hub-btn${ce.role === r ? ' on' : ''}" data-act="ce-role" data-r="${r}">${esc(t('ce_role_' + r))}</button>`).join('')}</div></div>
        </div>`);
    else if (ce.open === 'notes') over = fsOverlay('notes', 'ce-close', t('ce_cnotes'), t('fs_notes_q'), ceField('creator_notes', 'ce_cnotes', 14, 'ce_cnotes_h').replace('class="ce-fld area"', 'class="ce-fld area grow"'));
    return `
    <button type="button" class="hub-btn hub-back" data-act="ce-back">${ico(I.left, 18, '#c6a15b', 2)}${esc(ce.avatar ? t('back_dossier') : t('back_deck'))}</button>
    ${closeBtns()}
    <div class="fs-folder"><span class="tab">${esc(ce.avatar ? t('ce_edit_k') : t('ce_new_k'))} · ≈ ${Math.round(total / 3.6).toLocaleString()} ${esc(t('ce_tokens'))}</span></div>
    <div class="hub-you-card fs-card">
        <span class="fs-clip"></span>
        <div class="back b1">${CARD_BACK}</div>
        <div class="face">
            <div class="idx" style="left:12px;top:9px;color:#1b1418">K${suitSvg('spade', 16, '#1b1418')}</div>
            <div class="idx" style="right:12px;bottom:9px;transform:rotate(180deg);color:#1b1418">K${suitSvg('spade', 16, '#1b1418')}</div>
            <div class="pic">${img(pic, '', ce.name)}</div>
            <button type="button" class="hub-btn hub-repic" data-act="ce-pic">${ico(I.frame, 18, '#ffe2a8')}${esc(ce.avatar ? t('you_pic') : t('ce_pic'))}</button>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-act="ce-file" hidden>
        </div>
    </div>
    <div class="fs-name">
        <span class="k">${esc(t('fs_subject'))}</span>
        ${ce.avatar ? `<span class="nm" style="${nameFit(ce.name).replace(/\d+px/, m => Math.round(parseInt(m) * 0.72) + 'px')}">${esc(ce.name)}</span>` : `<input type="text" data-act="ce-name" maxlength="100" value="${esc(ce.name)}" placeholder="${esc(t('ce_name_ph'))}" spellcheck="false" aria-label="${esc(t('you_name'))}">`}
        <span class="typed"><label>${esc(t('ce_creator'))}<input type="text" data-act="ce-f" data-f="creator" maxlength="200" value="${esc(F.creator)}" spellcheck="false"></label><label>${esc(t('ce_version'))}<input type="text" data-act="ce-f" data-f="character_version" maxlength="200" value="${esc(F.character_version)}" spellcheck="false"></label></span>
    </div>
    <div class="fs-board">${slips.join('')}
        <div class="fs-status">
            <span class="k">${esc(t('fs_status'))}</span>
            <span class="fs-stamp${pct === 100 ? ' done' : ''}">${esc(pct === 100 ? t('fs_ready') : t('fs_pct', { n: pct }))}</span>
            <div class="fs-talk"><span>${esc(t('ce_talk'))}</span><div class="ce-slider"><input type="range" min="0" max="1" step="0.05" value="${ce.talk}" data-act="ce-talk" aria-label="${esc(t('ce_talk'))}"><b data-n="talk">${Math.round(ce.talk * 100)}%</b></div></div>
            <button type="button" class="hub-btn fs-heart${ce.fav ? ' on' : ''}" data-act="ce-fav" aria-pressed="${ce.fav}">${suitSvg('heart', 22, ce.fav ? '#c03a4b' : 'rgba(143,29,44,.3)')}${esc(ce.fav ? t('ce_fav_on') : t('ce_fav_off'))}</button>
        </div>
    </div>
    <div class="fs-actions">
        ${ce.avatar ? `<button type="button" class="hub-btn hub-ge-del${ce.del ? ' armed' : ''}" data-act="ce-del">${esc(ce.del ? t('ce_del_sure') : t('ce_del'))}</button>` : ''}
        <span style="flex:1"></span>
        <button type="button" class="hub-btn hub-plain" data-act="ce-back">${esc(t('cancel'))}</button>
        <button type="button" class="hub-btn hub-wax" data-act="ce-save"><span class="disc" style="width:64px;height:64px">${ico(ICO_SEAL, 28, '#ffe2a8', 2.6)}</span><span class="cap">${esc(ce.avatar ? t('save') : t('you_create'))}</span></button>
    </div>
    ${over}`;
}
let ceBusy = false;
async function saveCharEdit() {
    const ce = view.ce;
    if (!ce || ceBusy) return;
    const name = String(ce.name || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    if (!name) { ce.open = null; render(); focusFirst('input[data-act="ce-name"]'); toast(t('you_need_name')); return; }
    const F = ce.f;
    const greets = ce.greetings.map(g => String(g)).filter(g => g.trim());
    const talk = Math.max(0, Math.min(1, Number(ce.talk) || 0));
    const depth = Math.max(0, Math.min(999, Math.round(Number(ce.depth) || 0)));
    ceBusy = true;
    try {
        const ctx = getContext();
        if (ce.avatar) {
            const data = { alternate_greetings: greets, extensions: { talkativeness: talk, fav: !!ce.fav, depth_prompt: { prompt: F.depth_prompt, depth, role: ce.role } } };
            ['description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes', 'system_prompt', 'post_history_instructions', 'creator', 'character_version'].forEach(k => { data[k] = F[k]; });
            const body = { avatar: ce.avatar, description: F.description, personality: F.personality, scenario: F.scenario, first_mes: F.first_mes, mes_example: F.mes_example, creatorcomment: F.creator_notes, talkativeness: talk, fav: !!ce.fav, data };
            const r = await fetch('/api/characters/merge-attributes', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify(body) });
            if (!r.ok) throw new Error('edit ' + r.status);
            if (ce.file) {
                const fd = new FormData();
                fd.append('avatar', ce.file);
                fd.append('avatar_url', ce.avatar);
                const r2 = await fetch('/api/characters/edit-avatar', { method: 'POST', headers: getRequestHeaders({ omitContentType: true }), body: fd, cache: 'no-cache' });
                if (!r2.ok) throw new Error('avatar ' + r2.status);
            }
            if (typeof ctx.getOneCharacter === 'function') await ctx.getOneCharacter(ce.avatar); else await ctx.getCharacters();
            const av = ce.avatar;
            view.ce = null;
            toast(t('you_saved'));
            openDossier(av);
        } else {
            const fd = new FormData();
            fd.append('ch_name', name);
            ['description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes', 'system_prompt', 'post_history_instructions', 'creator', 'character_version'].forEach(k => fd.append(k, F[k]));
            fd.append('tags', '');
            fd.append('talkativeness', String(talk));
            fd.append('fav', String(!!ce.fav));
            fd.append('depth_prompt_prompt', F.depth_prompt);
            fd.append('depth_prompt_depth', String(depth));
            fd.append('depth_prompt_role', ce.role);
            greets.forEach(g => fd.append('alternate_greetings', g));
            if (ce.file) fd.append('avatar', ce.file);
            const r = await fetch('/api/characters/create', { method: 'POST', headers: getRequestHeaders({ omitContentType: true }), body: fd, cache: 'no-cache' });
            if (!r.ok) throw new Error('create ' + r.status);
            const av = (await r.text()).trim();
            // a form sends line breaks as \r\n: put the text back exactly as typed
            if (av) {
                const data = { extensions: { talkativeness: talk } };
                ['description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes', 'system_prompt', 'post_history_instructions'].forEach(k => { data[k] = F[k]; });
                data.alternate_greetings = greets;
                data.extensions.depth_prompt = { prompt: F.depth_prompt, depth, role: ce.role };
                await fetch('/api/characters/merge-attributes', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ avatar: av, description: F.description, personality: F.personality, scenario: F.scenario, first_mes: F.first_mes, mes_example: F.mes_example, creatorcomment: F.creator_notes, talkativeness: talk, data }) }).catch(() => null);
            }
            await getContext().getCharacters();
            view.ce = null;
            toast(t('ce_created', { name }));
            if (av && (getContext().characters || []).some(c => c.avatar === av)) openDossier(av); else { view.screen = 'deck'; render(); }
        }
    } catch (e) {
        console.error('[Tavern Suite Menu] character save', e);
        toast(t('save_failed'));
    } finally { ceBusy = false; }
}
async function deleteCharEdit() {
    const ce = view.ce;
    if (!ce || !ce.avatar || ceBusy) return;
    if (!ce.del) { ce.del = true; render(); return; }   // the second click deletes
    ceBusy = true;
    try {
        const ok = await deleteCharacter(ce.avatar, { deleteChats: false });
        if (!ok) throw new Error('not deleted');
        view.ce = null; view.dossier = null;
        view.screen = 'deck';
        render();
        toast(t('ce_deleted'));
    } catch (e) {
        console.error('[Tavern Suite Menu] character delete', e);
        toast(t('save_failed'));
    } finally { ceBusy = false; }
}

/* ============================================================ YOU — the persona page */
function personaList() {
    const p = (power_user && power_user.personas) || {};
    return Object.keys(p).map(file => ({ file, name: String(p[file] || file), d: (power_user.persona_descriptions && power_user.persona_descriptions[file]) || {} }));
}
const personaUrl = file => file ? `/User%20Avatars/${encodeURIComponent(file)}` : '';
const PERSONA_PER = 6;
/* where SillyTavern puts the persona text (persona_description_positions) */
const PERSONA_POS = [[0, 'you_pos0'], [2, 'you_pos2'], [3, 'you_pos3'], [4, 'you_pos4'], [9, 'you_pos9']];
function personaLinks(d) {
    const ctx = getContext();
    return (Array.isArray(d.connections) ? d.connections : []).slice(0, 5).map(c => {
        if (c && c.type === 'character') { const ch = (ctx.characters || []).find(x => x.avatar === c.id); return ch ? { name: ch.name, pic: `/thumbnail?type=avatar&file=${encodeURIComponent(ch.avatar)}` } : null; }
        if (c && c.type === 'group') { const g = (ctx.groups || []).find(x => x.id === c.id); return g ? { name: g.name, pic: g.avatar_url || '/img/five.png' } : null; }
        return null;
    }).filter(Boolean);
}
function personaEditFrom(file, name, d) {
    const pos = Number(d.position ?? 0);
    const o = {
        id: file, name, title: String(d.title || ''), desc: String(d.description || ''), file: null, preview: '', del: false,
        pos: PERSONA_POS.some(x => x[0] === pos) ? pos : 0,
        depth: Number.isFinite(Number(d.depth)) ? Number(d.depth) : 2,
        role: [0, 1, 2].includes(Number(d.role)) ? Number(d.role) : 0,
        lore: String(d.lorebook || ''),
        def: !!file && power_user.default_persona === file,
        open: null, just: null,
    };
    o.orig = yFields(o);
    return o;
}
/* the persona as a file too: the face being looked at, written on directly */
function yFields(ed) { return JSON.stringify([ed.name, ed.title, ed.desc, ed.pos, ed.depth, ed.role, ed.lore, ed.def]); }
function ensureYEdit() {
    if (view.yedit) return view.yedit;
    const p0 = personaList().find(x => x.file === view.yview) || { file: user_avatar, name: getContext().name1 || '', d: {} };
    view.yedit = personaEditFrom(p0.file, p0.name, p0.d);
    return view.yedit;
}
const yDirty = ed => !!ed && (!ed.id || !!ed.file || yFields(ed) !== ed.orig);
const LORE_TINTS = ['#5a1626', '#2f4a42', '#33404d', '#4a3a24', '#3a2a46', '#5a3a20', '#24343a'];
function renderYou() {
    const list = personaList();
    if (!view.yview || !(list.some(x => x.file === view.yview) || (view.yedit && !view.yedit.id))) view.yview = user_avatar;
    const cur = list.find(x => x.file === view.yview) || { file: user_avatar, name: getContext().name1 || '', d: {} };
    const isMe = cur.file === user_avatar;
    const ed = view.yedit;
    const v = ed || personaEditFrom(cur.file, cur.name, cur.d);   // what is shown: the draft, or the face itself
    const dirty = yDirty(ed);
    const creating = !!ed && !ed.id;
    const pages = Math.max(1, Math.ceil(list.length / 3));
    view.ypage = Math.max(0, Math.min(pages - 1, view.ypage || 0));
    const shown = list.slice(view.ypage * 3, view.ypage * 3 + 3);
    const pic = ed ? (ed.preview || (ed.id ? personaUrl(ed.id) : '/img/user-default.png')) : personaUrl(cur.file);
    const posName = t((PERSONA_POS.find(x => x[0] === v.pos) || PERSONA_POS[0])[1]);
    const links = creating ? [] : personaLinks(cur.d);
    const slips = [
        fsSlip('about', 'y-open', 'parch big', t('you_about'), !!v.desc.trim(), `<span class="hand">${clipLines(v.desc, 520)}</span>`, t('fs_about_e'), v.desc.length ? t('fs_chars', { n: v.desc.length.toLocaleString() }) : '', '--tilt:-1deg'),
        fsSlip('prompt', 'y-open', 'case', t('you_pos'), true, `<span class="checks">${PERSONA_POS.map(([n0, l]) => `<span class="ck${v.pos === n0 ? ' on' : ''}"><i></i>${esc(t(l))}</span>`).join('')}</span>${v.pos === 4 ? `<span class="meta">${esc(t('ce_depth'))} ${v.depth} · ${esc(t('ce_role_' + DEPTH_ROLES[v.role]))}</span>` : ''}`, '', '', '--tilt:1.2deg'),
        fsSlip('lore', 'y-open', 'torn', t('you_lore'), !!v.lore, `<span class="book" style="--bk:${LORE_TINTS[(v.lore.length || 0) % LORE_TINTS.length]}"><b>${esc(clip(v.lore, 40))}</b></span>`, t('fs_lore_e'), '', '--tilt:-2deg'),
    ];
    let over = '';
    if (ed && ed.open === 'about') over = fsOverlay('about', 'y-close', t('you_about'), t('fs_about_q'), `<label class="ce-fld area grow"><span class="ce-lbl">${esc(t('you_about'))}<i>${esc(t('you_about_h'))}</i><b class="ce-n" data-n="ydesc">${ed.desc.length || ''}</b></span><textarea data-act="y-desc" maxlength="20000" placeholder="${esc(t('you_about_ph'))}" spellcheck="false">${esc(ed.desc)}</textarea></label>`);
    else if (ed && ed.open === 'prompt') over = fsOverlay('prompt', 'y-close', t('you_pos'), t('fs_prompt_q'), `<div class="fs-handling">${PERSONA_POS.map(([n0, l]) => `<button type="button" class="hub-btn hd-opt${ed.pos === n0 ? ' on' : ''}" data-act="y-pos" data-v="${n0}" aria-pressed="${ed.pos === n0}"><i></i><b>${esc(t(l))}</b><span>${esc(n0 === 4 ? t('you_pos_h4l') : t('you_pos_h' + n0))}</span></button>`).join('')}</div>
        ${ed.pos === 4 ? `<div class="ce-row"><div class="ce-fld"><span class="ce-lbl">${esc(t('ce_depth'))}</span><div class="ce-step"><button type="button" class="hub-btn" data-act="y-depth" data-d="-1" aria-label="−">−</button><b data-n="ydepth">${ed.depth}</b><button type="button" class="hub-btn" data-act="y-depth" data-d="1" aria-label="+">+</button></div></div>
            <div class="ce-fld"><span class="ce-lbl">${esc(t('ce_role'))}</span><div class="ce-seg">${DEPTH_ROLES.map((r, i) => `<button type="button" class="hub-btn${ed.role === i ? ' on' : ''}" data-act="y-role" data-v="${i}">${esc(t('ce_role_' + r))}</button>`).join('')}</div></div></div>` : ''}`);
    else if (ed && ed.open === 'lore') {
        const books = ((world_names || []).slice().sort((a0, b0) => a0.localeCompare(b0)));
        over = fsOverlay('lore', 'y-close', t('you_lore'), t('fs_lore_q'), `<div class="fs-shelf">
            <button type="button" class="hub-btn bk none${!ed.lore ? ' on' : ''}" data-act="y-lore-set" data-v="" aria-pressed="${!ed.lore}"><b>${esc(t('you_lore_none'))}</b></button>
            ${books.map((w, i) => `<button type="button" class="hub-btn bk${w === ed.lore ? ' on' : ''}" data-act="y-lore-set" data-v="${esc(w)}" style="--bk:${LORE_TINTS[i % LORE_TINTS.length]};--h:${150 + (i * 37) % 40}px" aria-pressed="${w === ed.lore}" title="${esc(w)}"><b>${esc(w)}</b></button>`).join('')}
            ${books.length ? '' : `<div class="fs-none">${esc(t('fs_no_books'))}</div>`}
        </div>`);
    }
    return `
    <button type="button" class="hub-btn hub-back" data-act="home">${ico(I.left, 18, '#c6a15b', 2)}${esc(t('back_menu'))}</button>
    ${closeBtns()}
    <div class="fs-folder you"><span class="tab">${esc(creating ? t('you_new') : isMe ? t('you_kicker') : t('you_face'))}</span></div>
    <div class="hub-you-card fs-card">
        <span class="fs-clip"></span>
        <div class="back b1">${CARD_BACK}</div>
        <div class="face">
            <div class="idx" style="left:12px;top:9px;color:#8f1d2c">Q${suitSvg('heart', 16, '#8f1d2c')}</div>
            <div class="idx" style="right:12px;bottom:9px;transform:rotate(180deg);color:#8f1d2c">Q${suitSvg('heart', 16, '#8f1d2c')}</div>
            <div class="pic">${img(pic, '', v.name)}</div>
            <button type="button" class="hub-btn hub-repic" data-act="y-pic">${ico(I.frame, 18, '#ffe2a8')}${esc(t('you_pic'))}</button>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-act="y-file" hidden>
        </div>
    </div>
    <div class="fs-name">
        <span class="k">${esc(t('you_name'))}</span>
        <input type="text" data-act="y-name" maxlength="100" value="${esc(v.name)}" placeholder="${esc(t('you_name_ph'))}" spellcheck="false" aria-label="${esc(t('you_name'))}">
        <span class="typed wide"><label>${esc(t('you_title'))}<input type="text" data-act="y-title" maxlength="100" value="${esc(v.title)}" placeholder="${esc(t('you_title_ph'))}" spellcheck="false"></label></span>
    </div>
    <div class="fs-faces">
        <span class="k">${esc(t('you_faces'))}</span>
        <div class="row">
            <button type="button" class="hub-btn fs-pg" data-act="y-page" data-dir="-1" aria-label="${esc(t('prev'))}" ${view.ypage > 0 ? '' : 'disabled'}>${ico(I.left, 18, '#e8c882', 2)}</button>
            ${shown.map(x => `<button type="button" class="hub-btn fs-face${x.file === user_avatar ? ' me' : ''}${x.file === cur.file && !creating ? ' viewing' : ''}" data-act="y-pick" data-file="${esc(x.file)}" title="${esc(x.name)}" aria-pressed="${x.file === cur.file}">
                <span class="pic">${img(`/thumbnail?type=persona&file=${encodeURIComponent(x.file)}`, '', x.name)}</span><span class="nm">${esc(x.name)}</span></button>`).join('')}
            <button type="button" class="hub-btn fs-face add${creating ? ' viewing' : ''}" data-act="y-new" title="${esc(t('you_new'))}" aria-label="${esc(t('you_new'))}">${ico(I.plus, 28, '#e8c882', 2)}</button>
            <button type="button" class="hub-btn fs-pg" data-act="y-page" data-dir="1" aria-label="${esc(t('next'))}" ${view.ypage < pages - 1 ? '' : 'disabled'}>${ico(I.right, 18, '#e8c882', 2)}</button>
        </div>
    </div>
    <div class="fs-board you">${slips.join('')}
        <div class="fs-links">
            <span class="fs-hd">${ico('<path d="M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1"></path><path d="M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1"></path>', 18, 'currentColor', 1.8)}<b>${esc(t('fs_links'))}</b></span>
            ${links.length ? links.map(c => `<span class="ln">${img(c.pic, '', c.name)}<span>${esc(c.name)}</span></span>`).join('') : `<span class="fs-empty">${esc(t('fs_links_e'))}</span>`}
        </div>
        <div class="fs-status">
            <span class="k">${esc(t('fs_status'))}</span>
            <span class="fs-stamp${isMe && !creating ? ' done' : ''}">${esc(creating ? t('fs_draft') : isMe ? t('you_active') : t('fs_reserve'))}</span>
            <button type="button" class="hub-btn fs-heart star${v.def ? ' on' : ''}" data-act="y-def" aria-pressed="${v.def}" title="${esc(t('you_def_h'))}">${ico('<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"></path>', 20, v.def ? '#c03a4b' : 'rgba(143,29,44,.35)', 2)}${esc(v.def ? t('you_def_on') : t('you_def_off'))}</button>
            ${!isMe && !creating ? `<button type="button" class="hub-btn hub-red fs-become" data-act="y-become">${esc(t('you_become'))}</button>` : ''}
        </div>
    </div>
    <div class="fs-actions">
        ${ed && ed.id && list.length > 1 ? `<button type="button" class="hub-btn hub-ge-del${ed.del ? ' armed' : ''}" data-act="y-del">${esc(ed.del ? t('you_del_sure') : t('you_del'))}</button>` : (!ed && list.length > 1 ? `<button type="button" class="hub-btn hub-ge-del" data-act="y-del">${esc(t('you_del'))}</button>` : '')}
        <button type="button" class="hub-btn hub-plain fs-st" data-act="persona-st">${esc(t('you_manage'))}</button>
        <span style="flex:1"></span>
        ${dirty ? `<button type="button" class="hub-btn hub-plain" data-act="y-cancel">${esc(t('cancel'))}</button>
        <button type="button" class="hub-btn hub-wax fs-pulse" data-act="y-save"><span class="disc" style="width:64px;height:64px">${ico(ICO_SEAL, 28, '#ffe2a8', 2.6)}</span><span class="cap">${esc(creating ? t('you_create') : t('save'))}</span></button>` : `<span class="fs-saved">${esc(t('fs_saved'))}</span>`}
    </div>
    ${over}`;
}
/* Persona CRUD, the way SillyTavern's own persona panel does it */
async function uploadPersonaPicture(id, file) {
    let blob = file;
    if (!blob) { const r = await fetch('/img/user-default.png'); blob = await r.blob(); }
    const fd = new FormData();
    fd.append('avatar', new File([blob], 'avatar.png', { type: blob.type || 'image/png' }));
    fd.append('overwrite_name', id);
    const r = await fetch('/api/avatars/upload', { method: 'POST', headers: getRequestHeaders({ omitContentType: true }), cache: 'no-cache', body: fd });
    if (!r.ok) throw new Error('avatar upload ' + r.status);
}
let yBusy = false;
async function savePersona() {
    const ed = view.yedit;
    if (!ed || yBusy) return;
    const name = String(ed.name || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    if (!name) { toast(t('you_need_name')); return; }
    yBusy = true;
    try {
        const pos = PERSONA_POS.some(x => x[0] === ed.pos) ? ed.pos : 0;
        const depth = Math.max(0, Math.min(999, Math.round(Number(ed.depth) || 0)));
        const role = [0, 1, 2].includes(ed.role) ? ed.role : 0;
        const lore = ed.lore && (world_names || []).includes(ed.lore) ? ed.lore : '';
        // the extra fields, written the way SillyTavern's persona panel writes them
        const extras = id => {
            const d = power_user.persona_descriptions[id] || (power_user.persona_descriptions[id] = {});
            d.position = pos; d.depth = depth; d.role = role; d.lorebook = lore;
            if (id === user_avatar) {
                power_user.persona_description_position = pos;
                power_user.persona_description_depth = depth;
                power_user.persona_description_role = role;
                power_user.persona_description_lorebook = lore;
            }
            if (ed.def) power_user.default_persona = id;
            else if (power_user.default_persona === id) power_user.default_persona = null;
        };
        if (ed.id) {
            power_user.personas[ed.id] = name;
            const d = power_user.persona_descriptions[ed.id] || (power_user.persona_descriptions[ed.id] = {});
            d.description = String(ed.desc || '');
            d.title = String(ed.title || '').trim().slice(0, 100);
            extras(ed.id);
            if (ed.id === user_avatar) { power_user.persona_description = d.description; setUserName(name, { toastPersonaNameChange: false }); }
            if (ed.file) await uploadPersonaPicture(ed.id, ed.file);
            saveSettingsDebounced();
            view.yview = ed.id;
        } else {
            const id = `${Date.now()}-${name.replace(/[^a-zA-Z0-9]/g, '')}.png`;
            await initPersona(id, name, String(ed.desc || ''), String(ed.title || '').trim().slice(0, 100));
            extras(id);
            saveSettingsDebounced();
            await uploadPersonaPicture(id, ed.file || null);
            view.yview = id;
        }
        try { await getUserAvatars(true, view.yview); } catch (e) { /* the panel redraws next time */ }
        view.yedit = null;
        render();
        toast(t('you_saved'));
    } catch (e) {
        console.error('[Tavern Suite Menu] persona save', e);
        toast(t('save_failed'));
    } finally { yBusy = false; }
}
async function deletePersonaHere() {
    const ed = view.yedit;
    if (!ed || !ed.id || yBusy) return;
    const list = personaList();
    if (list.length < 2) return;
    if (!ed.del) { ed.del = true; render(); return; }   // the second click deletes
    yBusy = true;
    try {
        const id = ed.id;
        if (id === user_avatar) await setUserAvatar(list.find(x => x.file !== id).file, { toastPersonaNameChange: false });
        const r = await fetch('/api/avatars/delete', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ avatar: id }) });
        if (!r.ok) throw new Error('delete ' + r.status);
        const name = power_user.personas[id] || '';
        delete power_user.personas[id];
        delete power_user.persona_descriptions[id];
        if (power_user.default_persona === id) power_user.default_persona = null;
        const meta = getContext().chatMetadata;
        if (meta && meta.persona === id) { delete meta.persona; try { await getContext().saveMetadata(); } catch (e) { /* ignore */ } }
        saveSettingsDebounced();
        try { await eventSource.emit(event_types.PERSONA_DELETED, { avatarId: id, name }); } catch (e) { /* a listener failed */ }
        try { await getUserAvatars(true); } catch (e) { /* ignore */ }
        view.yedit = null; view.yview = user_avatar;
        render();
        toast(t('you_deleted'));
    } catch (e) {
        console.error('[Tavern Suite Menu] persona delete', e);
        toast(t('save_failed'));
    } finally { yBusy = false; }
}

/* ============================================================ TAGS — create, rename, recolour, delete, assign */
const TAG_COLORS = ['', '#8f1d2c', '#c03a4b', '#c6a15b', '#6b4a2c', '#2f4a42', '#33404d', '#5a2f45', '#3a2a36'];
const entityKey = e => e ? (e.kind === 'group' ? e.g.id : e.ch.avatar) : '';
function tagNew(name) {
    const nm = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!nm) return null;
    const ex = stTags.find(x => x && nkey(x.name) === nkey(nm));
    if (ex) return ex;
    const id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    const tag = { id, name: nm, folder_type: 'NONE', filter_state: DEFAULT_FILTER_STATE, sort_order: Math.max(0, ...stTags.map(x => Number(x.sort_order) || 0)) + 1, is_hidden_on_character_card: false, color: '', color2: '', create_date: Date.now() };
    stTags.push(tag);
    saveSettingsDebounced();
    return tag;
}
function tagDelete(id) {
    for (const k of Object.keys(stTagMap)) if (Array.isArray(stTagMap[k]) && stTagMap[k].includes(id)) stTagMap[k] = stTagMap[k].filter(x => x !== id);
    const i = stTags.findIndex(x => x.id === id);
    if (i >= 0) stTags.splice(i, 1);
    saveSettingsDebounced();
}
function tagAssignPopover(ent) {
    if (view.pop !== 'assign' || !ent) return '';
    const key = entityKey(ent);
    const mine = stTagMap[key] || [];
    const rows = tagList().map(tg => `<button type="button" class="hub-btn hub-tagrow${mine.includes(tg.id) ? ' on' : ''}" data-act="tag-assign" data-tag="${esc(tg.id)}" role="option" aria-selected="${mine.includes(tg.id)}">
        <span class="gem" style="background:${tg.color || '#c6a15b'}"></span><span class="nm">${esc(tg.name)}</span><span class="tick">${mine.includes(tg.id) ? ico('<path d="M5 12l5 5 9-10"></path>', 16, '#8f1d2c', 3) : ''}</span></button>`).join('');
    return `<div class="hub-pop hub-paper assign" role="listbox">
        <div class="hub-inner"></div>
        <div class="ph">${esc(t('tags_for', { name: ent.kind === 'group' ? ent.g.name : ent.ch.name }))}</div>
        ${rows || `<div class="hub-empty" style="padding:10px 0">${esc(t('tags_none'))}</div>`}
        <div class="newtag"><input type="text" data-act="tag-new-name" maxlength="60" placeholder="${esc(t('tag_new_ph'))}"><button type="button" class="hub-btn hub-sq lt" data-act="tag-new" title="${esc(t('tag_new'))}" aria-label="${esc(t('tag_new'))}">${ico(I.plus, 18, '#3a1a14')}</button></div>
    </div>`;
}
/* ============================================================ DIARY — the book, read here */
const DIARY_TABS = ['entries', 'events', 'people', 'gifts', 'summary'];
function diaryItems(dy, tab) {
    if (!dy) return [];
    const by = (arr, k) => (Array.isArray(arr) ? arr : []).filter(Boolean).slice().sort((a, b) => (Number(b[k]) || 0) - (Number(a[k]) || 0));
    if (tab === 'entries') return by(dy.entries, 'ts');
    if (tab === 'events') return by(dy.events, 'ts');
    if (tab === 'people') return (Array.isArray(dy.npcs) ? dy.npcs : []).filter(n => n && n.name);
    if (tab === 'gifts') return (Array.isArray(dy.gifts) ? dy.gifts : []).filter(Boolean).slice().reverse();
    if (tab === 'summary') return dy.summary ? [{ text: String(dy.summary) }] : [];
    return [];
}
/* The book is laid out like a book: every record becomes blocks measured in lines, long texts
   run over onto the next page ("continued"), and pages are filled until they are full. */
const BOOK_LINES = 21, BOOK_CHARS = 44;
const linesOf = (txt, w) => Math.max(1, Math.ceil(String(txt || '').length / (w || BOOK_CHARS)));
function diaryBlocks(tab, x) {
    const pic = safeUrl(x && x.portrait || '');
    const photo = pic ? `<span class="bk-photo" style="--tilt:${(String(x.id || x.name || x.title || '').length % 2) ? 3 : -3}deg">${img(pic)}<i></i></span>` : '';
    const out = [];
    const body = (text, head, headLines, extra) => {
        const chunks = chunkText(text, 470);
        chunks.forEach((c, i) => {
            const first = i === 0;
            out.push({
                lines: (first ? headLines : 1) + linesOf(c) + (first && photo ? 2 : 0) + 1,
                html: `<div class="bk-rec${first ? '' : ' cont'}">${first ? photo + head : `<div class="bk-cont">${esc(t('bk_cont'))}</div>`}<div class="bk-tx${first && tab === 'entries' ? ' drop' : ''}">${esc(c)}</div>${first && extra ? extra : ''}</div>`,
            });
        });
    };
    if (tab === 'entries') {
        body(x.text, `<div class="bk-date">${esc(x.date || '')}</div>${x.loc || x.weather || x.mood ? `<div class="bk-meta">${esc([x.loc, x.weather, x.mood].filter(Boolean).join(' · '))}</div>` : ''}`, 3);
    } else if (tab === 'events') {
        body(x.what, `<div class="bk-date">${esc(x.when || '')}</div><div class="bk-h">${esc(x.title || '')}</div>${x.where ? `<div class="bk-meta">${esc(x.where)}</div>` : ''}`, 4,
            x.who ? `<div class="bk-who">${String(x.who).split(/\s*[,;]\s*/).filter(Boolean).slice(0, 5).map(n => faceOf(n, 24)).join('')}<span>${esc(x.who)}</span></div>` : '');
    } else if (tab === 'people') {
        const tr = typeof x.trust === 'number' ? Math.max(0, Math.min(100, Math.round(x.trust))) : null;
        const ch = (getContext().characters || []).find(c => same(c.name, x.name));
        const face = pic || (ch ? thumbUrl(ch.avatar) : '');
        const head = `<div class="bk-person">${face ? `<span class="bk-oval">${img(face, '', x.name)}</span>` : `<span class="bk-oval none">${esc(String(x.name).slice(0, 1).toUpperCase())}</span>`}
            <div><div class="bk-h">${esc(x.name)}</div>${x.role ? `<div class="bk-meta">${esc(x.role)}</div>` : ''}${tr !== null ? `<div class="hub-hearts sm">${Array.from({ length: 5 }, (_, i) => i < Math.round(tr / 20) ? HEART_ON : HEART_OFF).join('')}</div>` : ''}</div></div>`;
        const text = [x.note, x.met ? `${t('f_met')}: ${x.met}` : '', x.look ? `${t('f_look')}: ${x.look}` : ''].filter(Boolean).join('\n');
        const chunks = chunkText(text, 470);
        chunks.forEach((c, i) => out.push({ lines: (i ? 1 : 5) + linesOf(c) + 1, html: `<div class="bk-rec${i ? ' cont' : ''}">${i ? `<div class="bk-cont">${esc(t('bk_cont'))} · ${esc(x.name)}</div>` : head}<div class="bk-tx">${esc(c)}</div></div>` }));
    } else if (tab === 'gifts') {
        out.push({ lines: 4 + linesOf(x.why), html: `<div class="bk-rec bk-gift">${photo}<div class="bk-date">${esc(x.dir === '←' ? t('got') : t('gave'))}${x.when ? ' · ' + esc(x.when) : ''}</div><div class="bk-h">${GIFT_BOX(x.dir === '←').replace('width="64" height="64"', 'width="30" height="30"')}${esc(x.item || '')}</div>${x.who ? `<div class="bk-who">${faceOf(x.who, 24)}<span>${esc(x.who)}</span></div>` : ''}${x.why ? `<div class="bk-tx">${esc(x.why)}</div>` : ''}</div>` });
    } else {
        chunkText(x.text, 820).forEach((c, i) => out.push({ lines: BOOK_LINES, html: `<div class="bk-rec bk-sum"><div class="bk-tx${i ? '' : ' illum'}">${esc(c)}</div></div>` }));
    }
    return out;
}
function diaryPages(dy, tab) {
    const pages = [];
    let cur = [], used = 0;
    diaryItems(dy, tab).forEach(x => diaryBlocks(tab, x).forEach(b => {
        if (used + b.lines > BOOK_LINES && cur.length) { pages.push(cur); cur = []; used = 0; }
        cur.push(b.html); used += b.lines;
    }));
    if (cur.length) pages.push(cur);
    return pages;
}
const BOOK_CORNER = `<svg width="70" height="70" viewBox="0 0 70 70" fill="none" aria-hidden="true"><path d="M4 66V20C4 10 10 4 20 4h46" stroke="#c6a15b" stroke-width="2.5"></path><path d="M12 66V26c0-8 6-14 14-14h40" stroke="#c6a15b" stroke-opacity=".5" stroke-width="1.2"></path><path d="M10 10c10 2 14 8 14 16M10 10c2 10 8 14 16 14" stroke="#e8c882" stroke-width="1.6"></path><circle cx="10" cy="10" r="4" fill="#e8c882"></circle></svg>`;
const FLOURISH = `<svg width="120" height="14" viewBox="0 0 120 14" fill="none" aria-hidden="true"><path d="M2 7h44M74 7h44" stroke="#8f1d2c" stroke-opacity=".5"></path><path d="M60 2l5 5-5 5-5-5z" fill="#8f1d2c"></path><path d="M48 7c4-5 8-5 10 0M72 7c-4-5-8-5-10 0" stroke="#8f1d2c"></path></svg>`;
function renderDiary() {
    const m = model || {};
    const dy = m.dy;
    const tab = DIARY_TABS.includes(view.dtab) ? view.dtab : 'entries';
    const pages = diaryPages(dy, tab);
    const spreads = Math.max(1, Math.ceil(pages.length / 2));
    view.dpage = Math.max(0, Math.min(spreads - 1, view.dpage || 0));
    const left = pages[view.dpage * 2] || null, right = pages[view.dpage * 2 + 1] || null;
    const who = m.ent ? (m.ent.kind === 'group' ? m.ent.g.name : m.ent.ch.name) : '';
    const turn = view.dturn > 0 ? ' turn-next' : view.dturn < 0 ? ' turn-prev' : '';
    view.dturn = 0;
    const blank = `<div class="bk-blank">❦<div>${esc(pages.length ? t('bk_end') : t('empty'))}</div></div>`;
    return `
    <button type="button" class="hub-btn hub-back" data-act="home">${ico(I.left, 18, '#c6a15b', 2)}${esc(t('back_menu'))}</button>
    ${closeBtns()}
    <div class="hub-book${turn}">
        <div class="cover"><span class="c tl">${BOOK_CORNER}</span><span class="c tr">${BOOK_CORNER}</span><span class="c bl">${BOOK_CORNER}</span><span class="c br">${BOOK_CORNER}</span></div>
        <div class="edges"></div>
        <div class="pg l hub-paper">
            <div class="ph">${esc(t('diary'))}${who ? ` · ${esc(who)}` : ''}</div>${FLOURISH}
            <div class="bk-body">${left ? left.join('') : blank}</div>
            <div class="pn">— ${view.dpage * 2 + 1} —</div>
        </div>
        <div class="pg r hub-paper">
            <div class="ph">${esc(t('d_' + tab))}</div>${FLOURISH}
            <div class="bk-body">${right ? right.join('') : (left ? blank : '')}</div>
            <div class="pn">— ${view.dpage * 2 + 2} —</div>
            ${view.dpage < spreads - 1 ? `<button type="button" class="hub-btn bk-corner" data-act="d-page" data-dir="1" aria-label="${esc(t('next'))}"></button>` : ''}
        </div>
        <div class="spine"></div>
        <div class="tabs">${DIARY_TABS.map((k, i) => `<button type="button" class="hub-btn hub-btab${k === tab ? ' on' : ''}" data-act="d-tab" data-tab="${k}" style="top:${40 + i * 74}px">${esc(t('d_' + k))}</button>`).join('')}</div>
        <div class="ribbon"></div><div class="ribbon r2"></div>
    </div>
    ${spreads > 1 ? `
    <button type="button" class="hub-btn hub-arrow l" data-act="d-page" data-dir="-1" style="left:40px" aria-label="${esc(t('prev'))}" ${view.dpage > 0 ? '' : 'disabled'}>${ico(I.left, 30, '#e8c882', 2)}</button>
    <button type="button" class="hub-btn hub-arrow r" data-act="d-page" data-dir="1" style="right:40px" aria-label="${esc(t('next'))}" ${view.dpage < spreads - 1 ? '' : 'disabled'}>${ico(I.right, 30, '#e8c882', 2)}</button>` : ''}
    <div class="bk-count">${spreads > 1 ? esc(t('bk_spread', { p: view.dpage + 1, n: spreads })) : ''}</div>
    <div class="hub-ds-actions" style="left:auto;right:60px;bottom:20px"><button type="button" class="hub-btn hub-plain" data-act="diary-ext">${esc(t('open_in_ext', { name: 'RPG Diary' }))}</button></div>`;
}

/* ============================================================ MAP — rooms, pictures, who is where */
function renderMapPage() {
    const m = model || {};
    const ms = m.ms;
    const maps = ms && Array.isArray(ms.maps) ? ms.maps.map((x, i) => ({ x, i })).filter(o => o.x) : [];
    if (!maps.some(o => o.i === view.mmap)) view.mmap = maps.length ? (maps.find(o => ms.hereMap && o.x.id === ms.hereMap) || maps[0]).i : 0;
    const map = maps.find(o => o.i === view.mmap);
    const here = hereRoom(ms);
    const where = ms && ms.where ? Object.entries(ms.where).filter(([, w]) => w && w.kind) : [];
    const peopleIn = (mp, r) => where.filter(([, w]) => w.kind === 'room' && w.room === r.room && (!w.loc || w.loc === r.loc) && (!w.map || !mp.id || w.map === mp.id)).map(([n]) => n);
    const rooms = [];
    const tree = map ? (map.x.blocks || []).filter(Boolean).map(b => `<div class="blk">${esc(b.name || '')}</div>` + (b.locations || []).filter(Boolean).map(l => `<div class="loc">${esc(l.name || '')}</div>` + (l.sublocs || []).filter(sb => sb && sb.name).map(sb => {
        const r = { map: map.x.name, mapId: map.x.id, block: String(b.name || ''), loc: String(l.name || ''), room: String(sb.name), sub: sb };
        const k = rooms.push(r) - 1;
        const isHere = here && here.sub === sb;
        const n = peopleIn(map.x, r).length;
        if (view.mroom == null && isHere) view.mroom = k;
        return `<button type="button" class="hub-btn hub-mroom${view.mroom === k ? ' on' : ''}" data-act="m-room" data-i="${k}">${isHere ? GEM : '<span class="dot"></span>'}<span class="nm">${esc(sb.name)}</span>${n ? `<span class="n">${n}</span>` : ''}${sb.locked ? ico('<rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path>', 14, '#8a6a4a', 1.8) : ''}</button>`;
    }).join('')).join('')).join('') : '';
    if (view.mroom == null || !rooms[view.mroom]) view.mroom = rooms.length ? 0 : null;
    const sel = view.mroom != null ? rooms[view.mroom] : null;
    const inRoom = sel ? peopleIn(map.x, sel).concat(here && sel.sub === here.sub ? [t('you')] : []) : [];
    return `
    <button type="button" class="hub-btn hub-back" data-act="home">${ico(I.left, 18, '#c6a15b', 2)}${esc(t('back_menu'))}</button>
    ${closeBtns()}
    <div class="hub-mtree hub-paper">
        <div class="hub-inner"></div>
        ${maps.length > 1 ? `<div class="mtabs">${maps.map(o => `<button type="button" class="hub-btn hub-tab${o.i === view.mmap ? ' on' : ''}" data-act="m-map" data-i="${o.i}">${esc(o.x.name || '—')}</button>`).join('')}</div>` : `<div class="mt">${esc(map ? map.x.name || t('map') : t('map'))}</div>`}
        <div class="list">${tree || `<div class="hub-empty">${esc(t('empty'))}</div>`}</div>
    </div>
    ${sel ? `
    <div class="hub-mview">
        <div class="frame"><img class="ph" data-mroom="1" alt="" draggable="false">${hasPicture(sel.sub) ? '' : `<div class="nopic">${ico(I.frame, 48, 'rgba(233,223,204,.35)', 1.2)}</div>`}</div>
        <div class="cap">
            <div class="path">${esc([sel.map, sel.block, sel.loc].filter(Boolean).join(' · '))}</div>
            <div class="tt">${esc(sel.room)}</div>
            ${sel.sub.desc ? `<div class="desc">${esc(clip(plain(sel.sub.desc), 600))}</div>` : ''}
            ${inRoom.length ? `<div class="here"><span>${esc(t('here_now'))}</span> ${inRoom.map(n => `<b>${esc(n)}</b>`).join(', ')}</div>` : ''}
        </div>
    </div>` : ''}
    <div class="hub-mwho">
        <div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:13px;letter-spacing:0.18em;color:#6b4a2c">${esc(t('where_now'))}</span></div>
        ${where.length ? where.slice(0, 9).map(([n, w]) => `<div class="r"><span style="font-weight:700">${esc(n)}</span><span>${esc(whereText(w) || '—')}</span></div>`).join('') : `<div class="r"><i>${esc(t('empty'))}</i></div>`}
    </div>
    <div class="hub-ds-actions" style="left:auto;right:60px;bottom:30px"><button type="button" class="hub-btn hub-plain" data-act="map-ext">${esc(t('open_in_ext', { name: 'RPG Map' }))}</button></div>`;
}
async function hydrateMapRoom() {
    const el = stageEl.querySelector('img[data-mroom]');
    if (!el || !model || !model.ms) return;
    const ms = model.ms;
    const map = ms.maps && ms.maps[view.mmap];
    if (!map) return;
    const rooms = [];
    (map.blocks || []).filter(Boolean).forEach(b => (b.locations || []).filter(Boolean).forEach(l => (l.sublocs || []).filter(sb => sb && sb.name).forEach(sb => rooms.push(sb))));
    const sub = rooms[view.mroom];
    const u = await roomPicture(sub);
    if (u && el.isConnected) { el.src = u; el.classList.add('on'); }
}

/* ============================================================ GROUP DOSSIER */
const PIN_POS = {
    1: [[187, 120]],
    2: [[60, 150], [314, 150]],
    3: [[187, 30], [31, 300], [345, 300]],
    4: [[40, 40], [334, 40], [40, 300], [334, 300]],
    5: [[187, 10], [20, 190], [354, 190], [80, 390], [294, 390]],
};
function renderGroup() {
    const ctx = getContext();
    const g = (ctx.groups || []).find(x => x.id === view.group);
    if (!g) return `<button type="button" class="hub-btn hub-back" data-act="deck">${ico(I.left, 18, '#c6a15b', 2)}${esc(t('back_deck'))}</button>${closeBtns()}`;
    const live = liveEntity();
    const chatId = live && live.kind === 'group' && live.g.id === g.id ? ctx.chatId : (g.chat_id || null);
    const ms = mapStateOf(chatId), dy = diaryOf(chatId);
    const mem = membersOf(g);
    const shownMem = mem.slice(0, 5);
    if (!shownMem.some(c => c.avatar === view.gsel)) view.gsel = shownMem[0] ? shownMem[0].avatar : null;
    const chosen = shownMem.find(c => c.avatar === view.gsel) || null;
    const chron = chronicleOf(ms);
    const shared = chron.filter(c => c.names.filter(n => mem.some(x => same(x.name, n))).length >= 2);
    const pos = PIN_POS[Math.max(1, shownMem.length)] || PIN_POS[5];
    const centre = i => [pos[i][0] + 65, pos[i][1] + 80];
    const links = [];
    for (let a = 0; a < shownMem.length; a++) for (let b = a + 1; b < shownMem.length; b++) {
        const both = shared.find(c => c.names.some(n => same(n, shownMem[a].name)) && c.names.some(n => same(n, shownMem[b].name)));
        if (both) links.push({ a, b, text: both.text });
    }
    const secret = heardOf(ms).filter(o => Array.isArray(o.names) && o.names.some(n => mem.some(x => same(x.name, n)))).pop();
    const secretText = secret ? (secret.kind === 'letter' ? (secret.title || (secret.paragraphs || [])[0] || '') : ((secret.lines || []).find(l => l && l.say) || {}).say || '') : '';
    // the group's own picture, when it has one, is the front card
    const gp = groupPicture(g);
    const fan = gp ? [{ pic: gp, name: g.name }].concat(mem.slice(0, 2)) : mem.slice(0, 3);
    const fanPos = [[80, 10, 0], [20, 40, -14], [140, 40, 14]];
    const npc = chosen ? npcOf(dy, chosen.name) : null;
    return `
    <button type="button" class="hub-btn hub-back" data-act="deck">${ico(I.left, 18, '#c6a15b', 2)}${esc(t('back_deck'))}</button>
    ${closeBtns()}
    <div class="gd-fan">
        ${fan.map((c, i) => ({ c, i })).reverse().map(({ c, i }) => `<div class="gd-c" style="left:${fanPos[i][0]}px;top:${fanPos[i][1]}px;transform:rotate(${fanPos[i][2]}deg);z-index:${i === 0 ? 3 : 1}"><div class="pic">${img(c.pic || avatarUrl(c.avatar), '', c.name)}<span>${esc(c.name)}</span></div><span class="idx">${RANKS[i]}</span></div>`).join('')}
        <svg width="420" height="420" viewBox="0 0 420 420" fill="none" aria-hidden="true" style="position:absolute;left:-30px;top:-10px;pointer-events:none;z-index:4">
            <defs><pattern id="gdChain" width="24" height="14" patternUnits="userSpaceOnUse"><ellipse cx="12" cy="7" rx="10" ry="5" stroke="#b8954f" stroke-width="3"></ellipse></pattern></defs>
            <rect x="-20" y="203" width="460" height="14" fill="url(#gdChain)" transform="rotate(-8 210 210)"></rect>
        </svg>
        <div class="hub-lock" style="top:168px;z-index:5"><svg width="60" height="74" viewBox="0 0 64 78" aria-hidden="true"><path d="M16 34V22a16 16 0 0 1 32 0v12" stroke="#c6a15b" stroke-width="6" fill="none"></path><rect x="6" y="32" width="52" height="42" rx="6" fill="#2a1a1f" stroke="#c6a15b" stroke-width="3"></rect><circle cx="32" cy="50" r="6" fill="#c6a15b"></circle><path d="M32 54v10" stroke="#c6a15b" stroke-width="4"></path></svg></div>
    </div>
    <div class="gd-info">
        <div style="font-size:14px;letter-spacing:0.24em;color:var(--accent)">${esc(t('group_chat').toUpperCase())}</div>
        <h1 style="${nameFit(g.name)}" title="${esc(g.name)}">${esc(g.name)}</h1>
        <div style="font-size:18px;font-style:italic;color:#cbbca4">${esc(t('group_sub', { n: mem.length }))}</div>
        <div style="display:flex;gap:10px;margin-top:8px">
            <button type="button" class="hub-btn hub-red" data-act="start" data-key="${esc('g:' + g.id)}">${esc(t('open_chat'))}</button>
            ${hasPhone() ? `<button type="button" class="hub-btn hub-plain" data-act="group-phone">${esc(t('phone_shared'))}</button>` : ''}
            <button type="button" class="hub-btn hub-sq" data-act="edit-group" title="${esc(t('edit_group'))}" aria-label="${esc(t('edit_group'))}" style="width:44px;height:44px">${ico(I.edit, 20)}</button>
        </div>
    </div>
    <div class="gd-board">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
            <div style="font-family:var(--f-title);font-size:28px;color:#f2e5cb">${esc(t('who_linked'))}</div>
            <div style="font-size:14px;color:#b9ab98">${esc(t('from_chron'))}</div>
        </div>
        <div class="area">
            <svg width="504" height="640" viewBox="0 0 504 640" fill="none" aria-hidden="true" style="position:absolute;inset:0">
                ${links.map((l, i) => { const [x1, y1] = centre(l.a), [x2, y2] = centre(l.b); return `<path class="gd-thread" d="M${x1} ${y1} L${x2} ${y2}" stroke="#b01f30" stroke-width="2.5" style="animation-delay:${(i * 0.3).toFixed(1)}s"></path>`; }).join('')}
            </svg>
            ${shownMem.map((c, i) => `<button type="button" class="hub-btn gd-pinp${c.avatar === view.gsel ? ' on' : ''}" data-act="gsel" data-av="${esc(c.avatar)}" aria-label="${esc(c.name)}" style="left:${pos[i][0]}px;top:${pos[i][1]}px;transform:rotate(${[-3, 4, -5, 3, -2][i]}deg)">${img(thumbUrl(c.avatar), 'ph', c.name) || '<div class="ph"></div>'}<div class="nm">${esc(c.name)}</div></button>`).join('')}
            ${links.map(l => { const [x1, y1] = centre(l.a), [x2, y2] = centre(l.b); return `<div class="gd-label" style="left:${(x1 + x2) / 2}px;top:${(y1 + y2) / 2}px">${esc(clip(l.text, 70))}</div>`; }).join('')}
            ${!links.length ? `<div class="gd-label" style="left:252px;top:${shownMem.length >= 3 ? 250 : 380}px;transform:translate(-50%,-50%) rotate(-1deg)">${esc(t('no_links'))}</div>` : ''}
            ${secretText ? `<div class="gd-secret"><div class="k">${esc(t('shared_secret'))}</div><div class="v">${esc(clip(secretText, 120))}</div></div>` : ''}
        </div>
    </div>
    <div class="gd-side">
        <div class="gd-where">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px"><span style="font-size:13px;letter-spacing:0.18em;color:#6b4a2c">${esc(t('where_now'))}</span><span style="font-size:12px;color:#6b5d4c">RPG Map</span></div>
            ${mem.slice(0, 8).map(c => `<div class="r"><span style="font-weight:700">${esc(c.name)}</span><span>${esc(whereText(whereOf(ms, c.name)) || '—')}</span></div>`).join('')}
        </div>
        ${chosen ? `<div class="gd-chosen">
            <div style="font-size:13px;letter-spacing:0.2em;color:var(--accent)">${esc(t('chosen', { name: chosen.name.toUpperCase() }))}</div>
            ${npc && (npc.note || npc.role) ? `<div class="note">${esc(clip(npc.note || npc.role, 260))}</div>` : ''}
            <button type="button" class="hub-btn" data-act="open-dossier" data-key="${esc('c:' + chosen.avatar)}" style="display:inline-flex;align-items:center;gap:8px;height:44px;margin-top:8px;font-size:17px;color:#e8c882">${esc(t('own_dossier'))}${ico(I.right, 16, '#e8c882', 2)}</button>
        </div>` : ''}
        <div class="gd-together">
            <div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-family:var(--f-title);font-size:20px;color:#5a1626">${esc(t('together'))}</span><span style="font-size:12px;color:#6b5d4c">${esc(t('chronicle').toLowerCase())}</span></div>
            ${shared.length ? shared.slice(0, 4).map(c => `<div class="r"><span class="w">${esc(c.when || '')}</span><span class="tx">${esc(c.names.join(', '))}: ${esc(c.text)}</span></div>`).join('') : `<div class="r"><span class="tx" style="font-style:italic">${esc(t('no_links'))}</span></div>`}
        </div>
    </div>`;
}

/* ============================================================ EVENTS */
function entityByKey(key) {
    const ctx = getContext();
    key = String(key || '');
    if (key.startsWith('c:')) { const idx = (ctx.characters || []).findIndex(c => c.avatar === key.slice(2)); return idx >= 0 ? { kind: 'char', ch: ctx.characters[idx], idx } : null; }
    if (key.startsWith('g:')) { const g = (ctx.groups || []).find(x => x.id === key.slice(2)); return g ? { kind: 'group', g } : null; }
    return null;
}
/* Open the menu's chat, then the module through its own button. If that button never
   shows (the module is off), the menu stays and says so instead of closing on nothing. */
async function openPhoneHere() {
    const m = model;
    if (!m || !m.chatId) return;
    if (document.body.classList.contains('rpg-hub-phone')) {   // a second press puts it away
        const r = document.getElementById('rph-roster');
        if (r) r.classList.remove('visible');
        phoneMode(false);
        return;
    }
    if (getContext().chatId !== m.chatId) toast(t('opening'));
    const ok = await ensureChat(m.chatId, m.ent);
    if (!ok) { toast(t('open_failed')); return; }
    const btn = await waitFor(() => { const e = document.getElementById('rph-btn'); return e && e.offsetParent !== null ? e : null; }, 2500);
    if (!btn) { toast(t('module_off', { name: 'RPG Phone' })); return; }
    phoneMode(true);
    btn.click();
    sound('open');
}
/* The rabbit hole over the menu, like the phone: its window is lifted above the menu while it
   is open, and when it closes you are back in the menu. */
let dngWatch = null;
async function openDungeonsHere() {
    const m = model;
    if (!m || !m.chatId) return;
    const br = () => window.RPG && window.RPG.dungeons;
    if (!br() || typeof br().open !== 'function') { toast(t('not_installed', { name: 'RPG Dungeons' })); return; }
    if (getContext().chatId !== m.chatId) toast(t('opening'));
    const ok = await ensureChat(m.chatId, m.ent);
    if (!ok) { toast(t('open_failed')); return; }
    if (isOff('rpg_dungeons')) { toast(t('module_off', { name: 'RPG Dungeons' })); return; }
    document.body.classList.add('rpg-hub-dng');
    try { br().open(); } catch (e) { document.body.classList.remove('rpg-hub-dng'); toast(t('open_failed')); return; }
    const modal = document.getElementById('rdg-modal');
    if (!modal || !modal.classList.contains('rdg-open')) { document.body.classList.remove('rpg-hub-dng'); toast(t('module_off', { name: 'RPG Dungeons' })); return; }
    if (dngWatch) dngWatch.disconnect();
    dngWatch = new MutationObserver(() => {
        if (modal.classList.contains('rdg-open')) return;
        document.body.classList.remove('rpg-hub-dng');
        dngWatch.disconnect(); dngWatch = null;
        if (isOpen) refresh(true);   // tickets and companions may have changed
    });
    dngWatch.observe(modal, { attributes: true, attributeFilter: ['class'] });
}
async function withChat(sel, label) {
    const m = model;
    if (!m || !m.chatId) return;
    if (getContext().chatId !== m.chatId) toast(t('opening'));
    const ok = await ensureChat(m.chatId, m.ent);
    if (!ok) { toast(t('open_failed')); return; }
    if (!sel) { closeHub(); return; }
    const btn = await waitFor(() => { const e = document.querySelector(sel); return e && e.offsetParent !== null ? e : null; }, 2500);
    if (!btn) { toast(t('module_off', { name: label })); return; }
    closeHub();
    btn.click();
}
function openStDrawer(sel) {
    const d = document.querySelector(sel);
    if (!d) return null;
    const icon = d.querySelector('.drawer-icon');
    if (icon && icon.classList.contains('closedIcon')) { const tg = d.querySelector('.drawer-toggle'); if (tg) tg.click(); }
    return d;
}
function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || !hubEl.contains(el)) return;
    const act = el.getAttribute('data-act');
    if (act === 'panel-close' && e.target.closest('[data-stop]') && !e.target.closest('.x')) return;
    if ((act === 'h-close' || act === 'p-zoom' || act === 'ce-close' || act === 'y-close') && e.target.closest('[data-stop2]') && !e.target.closest('.x, .fs-done')) return;   // a click on the letter itself   // a click inside the sheet
    if (el.disabled) return;
    const snd = soundFor(act);
    if (snd) sound(snd);
    const inPop = !!e.target.closest('.hub-pop');
    if (view.pop && act !== 'pop' && act !== 'tag-pick' && act !== 'showcase' && !inPop) { view.pop = null; view.tagEdit = null; render(); }
    switch (act) {
        case 'close': closeHub(); break;
        case 'home': view.screen = 'main'; view.panel = null; refresh(true); break;
        case 'talk': {
            if (!model) break;
            // the next line, and another face to say it with
            if (model.lines.length > 1) view.line = (view.line + 1) % model.lines.length;
            if (model.sprites && model.sprites.length > 1) model.sprite = pickSprite(model.sprites, model.sprite);
            const say = stageEl.querySelector('.hub-bubble .say'), more = stageEl.querySelector('.hub-bubble .more'), face = stageEl.querySelector('.hub-sprite img');
            if (say && model.lines.length) {
                say.textContent = model.lines[view.line % model.lines.length];
                if (more) more.textContent = `${(view.line % model.lines.length) + 1} / ${model.lines.length}`;
                const b = say.closest('.hub-bubble');   // replay only the bubble's pop
                b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
            }
            if (face && model.sprite) face.src = model.sprite;
            if (!say && !face) render();
            break;
        }
        case 'continue': {
            if (!model || !model.chatId) break;
            const calm = settings.motion === 'calm' || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
            if (calm) { withChat(null); break; }
            if (view.torn) break;
            el.classList.add('tearing');   // the stub tears off and falls, then the chat opens
            view.torn = true;              // a redraw meanwhile keeps the stub gone
            sound('rip');
            setTimeout(async () => { try { await withChat(null); } finally { view.torn = false; if (isOpen) render(); } }, 620);   // still here (it failed): mend the ticket
            break;
        }
        case 'diary': view.dtab = 'entries'; view.dpage = 0; view.screen = 'diary'; render(); break;
        case 'map': view.mmap = null; view.mroom = null; view.screen = 'map'; render(); break;
        case 'diary-ext': withChat('#rpg-diary-btn', 'RPG Diary'); break;
        case 'map-ext': withChat('#rpg-map-btn', 'RPG Map'); break;
        case 'd-tab': view.dtab = el.getAttribute('data-tab'); view.dpage = 0; render(); break;
        case 'd-page': { const d = Number(el.getAttribute('data-dir')) || 0; view.dpage += d; view.dturn = d; render(); break; }
        case 'm-map': view.mmap = Number(el.getAttribute('data-i')) || 0; view.mroom = null; render(); break;
        case 'm-room': view.mroom = Number(el.getAttribute('data-i')) || 0; render(); break;
        case 'y-page': view.ypage += Number(el.getAttribute('data-dir')) || 0; render(); break;
        case 'y-pick': { const f = el.getAttribute('data-file'); if (yDirty(view.yedit) && f !== (view.yedit && view.yedit.id)) { toast(t('fs_unsaved')); break; } view.yview = f; view.yedit = null; render(); break; }
        case 'persona-st': closeHub().then(() => openStDrawer('#persona-management-button')); break;
        case 'y-open': { const ed = ensureYEdit(); ed.open = el.getAttribute('data-slip'); ed.wasFilled = ed.open === 'about' ? !!ed.desc.trim() : ed.open === 'lore' ? !!ed.lore : true; render(); focusFirst('.fs-open textarea'); break; }
        case 'y-close': if (view.yedit) { const ed = view.yedit; const k = ed.open; ed.open = null; ed.just = k && !ed.wasFilled && ((k === 'about' && ed.desc.trim()) || (k === 'lore' && ed.lore)) ? k : null; render(); if (ed.just) { sound('seal'); setTimeout(() => { ed.just = null; }, 900); } } break;
        case 'y-new': if (yDirty(view.yedit)) { toast(t('fs_unsaved')); break; } view.yedit = personaEditFrom(null, '', {}); render(); focusFirst('input[data-act="y-name"]'); break;
        case 'y-def': { const ed = ensureYEdit(); ed.def = !ed.def; render(); break; }
        case 'y-pos': if (view.yedit) { const v = Number(el.getAttribute('data-v')); if (PERSONA_POS.some(x => x[0] === v)) { view.yedit.pos = v; render(); } } break;
        case 'y-role': if (view.yedit) { const v = Number(el.getAttribute('data-v')); if ([0, 1, 2].includes(v)) { view.yedit.role = v; render(); } } break;
        case 'y-depth': if (view.yedit) { view.yedit.depth = Math.max(0, Math.min(999, view.yedit.depth + (Number(el.getAttribute('data-d')) || 0))); const b = stageEl.querySelector('[data-n="ydepth"]'); if (b) b.textContent = view.yedit.depth; } break;
        case 'y-lore-set': if (view.yedit) { const v = el.getAttribute('data-v') || ''; if (!v || (world_names || []).includes(v)) view.yedit.lore = v; render(); } break;
        case 'y-cancel': view.yedit = null; render(); break;
        case 'y-save': savePersona(); break;
        case 'y-del': ensureYEdit(); deletePersonaHere(); break;
        case 'y-pic': { const f = stageEl.querySelector('input[data-act="y-file"]'); if (f) f.click(); break; }
        case 'y-become': {
            const f = view.yview;
            if (!f || f === user_avatar) break;
            setUserAvatar(f, { toastPersonaNameChange: false }).then(() => { render(); toast(t('you_switched', { name: (personaList().find(x => x.file === f) || {}).name || f })); }).catch(e => { console.error('[Tavern Suite Menu] persona', e); toast(t('save_failed')); });
            break;
        }
        case 'hide': {
            const k = el.getAttribute('data-key');
            if (!k) break;
            const i = settings.hidden.indexOf(k);
            if (i >= 0) { settings.hidden.splice(i, 1); toast(t('unhidden')); }
            else { settings.hidden.push(k); toast(t('hidden_now')); }
            save(); view.pop = null;
            if (view.deck.tab === 'hidden' && !settings.hidden.length) view.deck.tab = 'all';
            render();
            break;
        }
        case 'showcase': {
            const id = el.getAttribute('data-tag');
            const i = settings.showcase.indexOf(id);
            if (i >= 0) settings.showcase.splice(i, 1); else settings.showcase.push(id);
            save(); view.deck.page = 0; render();
            break;
        }
        case 'showcase-clear': settings.showcase = []; save(); view.deck.page = 0; render(); break;
        case 'tag-assign': {
            const ent = view.deckEnt, id = el.getAttribute('data-tag');
            const tg = stTags.find(x => x.id === id);
            if (!ent || !tg) break;
            const key = entityKey(ent);
            if ((stTagMap[key] || []).includes(id)) removeTagFromEntity(tg, key); else addTagsToEntity(tg, key);
            render();
            break;
        }
        case 'tag-new': {
            const inp = stageEl.querySelector('input[data-act="tag-new-name"]');
            const tg = tagNew(inp ? inp.value : '');
            if (!tg) { toast(t('tag_need_name')); break; }
            if (!el.getAttribute('data-only') && view.deckEnt) addTagsToEntity(tg, entityKey(view.deckEnt));
            render();
            break;
        }
        case 'tag-edit': { const tg = stTags.find(x => x.id === el.getAttribute('data-tag')); if (tg) { view.tagEdit = { id: tg.id, name: String(tg.name || ''), color: safeColor(tg.color), del: false }; render(); } break; }
        case 'tag-edit-cancel': view.tagEdit = null; render(); break;
        case 'tag-color': if (view.tagEdit) { const c = el.getAttribute('data-c'); view.tagEdit.color = TAG_COLORS.includes(c) ? c : ''; render(); } break;
        case 'tag-save': {
            const te = view.tagEdit, tg = te && stTags.find(x => x.id === te.id);
            if (!tg) break;
            const nm = String(te.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
            if (!nm) { toast(t('tag_need_name')); break; }
            tg.name = nm; tg.color = te.color || '';
            saveSettingsDebounced();
            view.tagEdit = null; render();
            break;
        }
        case 'tag-del': {
            const te = view.tagEdit;
            if (!te) break;
            if (!te.del) { te.del = true; render(); break; }
            tagDelete(te.id);
            settings.showcase = settings.showcase.filter(x => x !== te.id); save();
            if (view.deck.tag === te.id) view.deck.tag = '';
            view.tagEdit = null; render();
            break;
        }
        case 'ds-bg': {
            const pics = view.dpics || [];
            if (!pics.length) break;
            const r = pics[Math.floor(Math.random() * pics.length)];
            roomPicture(r.sub).then(u => { if (u) setBackground(u); });
            break;
        }
        case 'phone': openPhoneHere(); break;
        case 'dungeons': openDungeonsHere(); break;
        case 'settings': closeHub().then(() => {
            const d = openStDrawer('#extensions-settings-button');
            const box = document.getElementById('rpg-hub-settings');
            if (d && box) setTimeout(() => {
                const c = box.querySelector('.inline-drawer-content');
                if (c && getComputedStyle(c).display === 'none') { const tg = box.querySelector('.inline-drawer-toggle'); if (tg) tg.click(); }
                box.scrollIntoView({ block: 'start', behavior: 'smooth' });
            }, 250);
        }); break;
        case 'persona': view.ypage = 0; view.screen = 'you'; render(); break;
        case 'deck': view.screen = 'deck'; view.panel = null; render(); break;
        case 'dossier': if (model && model.focus) openDossier(model.focus.avatar); break;
        case 'chronicle': case 'heard': view.panel = act; view.pp = 0; view.pzoom = null; view.hopen = null; view.htab = 'all'; markSeen(act); render(); break;
        case 'calendar': case 'gifts': case 'recent': case 'rooms': view.panel = act; view.pp = 0; view.pzoom = null; render(); break;
        case 'pp': view.pp = (view.pp || 0) + (Number(el.getAttribute('data-dir')) || 0); view.pzoom = null; render(); break;
        case 'pp-go': view.pp = Number(el.getAttribute('data-n')) || 0; view.pzoom = null; render(); break;
        case 'p-zoom': { const i = Number(el.getAttribute('data-i')); view.pzoom = view.pzoom === i ? null : i; render(); break; }
        case 'h-tab': view.htab = el.getAttribute('data-tab'); view.pp = 0; view.hopen = null; render(); break;
        case 'h-open': { const id = el.getAttribute('data-id'); if (id) { view.hopen = id; markHeardOpen(id); render(); } break; }
        case 'h-close': view.hopen = null; render(); break;
        case 'panel-close': view.panel = null; render(); break;
        case 'open-recent': {
            const r = ((model && model.rec) || []).filter(recShown).map(x => ({ r: x, e: entityOf(x) }))[Number(el.getAttribute('data-i'))];
            if (!r) break;
            toast(t('opening'));
            ensureChat(r.r.file_id, r.e).then(ok => { if (ok) closeHub(); else toast(t('open_failed')); });
            break;
        }
        case 'pick-room': {
            const r = roomsOf(model && model.ms).filter(x => hasPicture(x.sub))[Number(el.getAttribute('data-i'))];
            if (!r) break;
            roomPicture(r.sub).then(u => {
                if (!u) return;
                view.bgOverride = { url: u, name: r.room };
                if (model) model.bg = view.bgOverride;
                view.panel = null; render(); toast(t('bg_set', { name: r.room }));
            });
            break;
        }
        case 'tab': view.deck.tab = el.getAttribute('data-tab'); view.deck.page = 0; render(); break;
        case 'page': view.deck.page += Number(el.getAttribute('data-dir')) || 0; render(); break;
        case 'goto': view.deck.page = Number(el.getAttribute('data-n')) || 0; render(); break;
        case 'sel': view.deck.sel = el.getAttribute('data-key'); render(); break;
        case 'start': {
            const ent = entityByKey(el.getAttribute('data-key'));
            if (!ent) break;
            toast(t('opening'));
            openEntity(ent).then(ok => { if (ok) closeHub(); else toast(t('open_failed')); }).catch(() => toast(t('open_failed')));
            break;
        }
        case 'open-dossier': { const k = String(el.getAttribute('data-key') || ''); if (k.startsWith('c:')) openDossier(k.slice(2)); break; }
        case 'open-group': { const k = String(el.getAttribute('data-key') || ''); if (k.startsWith('g:')) { view.group = k.slice(2); view.gsel = null; view.screen = 'group'; render(); } break; }
        case 'gsel': view.gsel = el.getAttribute('data-av'); render(); break;
        case 'new-group': openGroupEditor(null); break;
        case 'edit-group': openGroupEditor(view.group); break;
        case 'ge-toggle': {
            if (!view.ge) break;
            const av = el.getAttribute('data-av');
            const i = view.ge.members.indexOf(av);
            if (i >= 0) view.ge.members.splice(i, 1); else view.ge.members.push(av);
            view.ge.del = false;
            render();
            break;
        }
        case 'ge-page': if (view.ge) { view.ge.page += Number(el.getAttribute('data-dir')) || 0; render(); } break;
        case 'party-back': leaveParty(); break;
        case 'pop': { const k = el.getAttribute('data-pop'); view.pop = view.pop === k ? null : k; view.tagEdit = null; render(); break; }
        case 'tag-pick': {
            const k = el.getAttribute('data-pop'), tg = String(el.getAttribute('data-tag') || '');
            if (k === 'ge-tags' && view.ge) { view.ge.tag = tg; view.ge.page = 0; }
            if (k === 'tags') { view.deck.tag = tg; view.deck.page = 0; }
            view.pop = null; render();
            break;
        }
        case 'sort-toggle': view.deck.sort = view.deck.sort === 'name' ? 'recent' : 'name'; view.deck.page = 0; render(); break;
        case 'ge-save': saveGroupEditor(); break;
        case 'ge-delete': deleteFromEditor(); break;
        case 'week': view.week = el.getAttribute('data-w') === '1'; render(); break;
        case 'group-phone': {
            const g = (getContext().groups || []).find(x => x.id === view.group);
            if (!g) break;
            toast(t('opening'));
            ensureChat(g.chat_id || null, { kind: 'group', g }).then(async ok => {
                if (!ok) { toast(t('open_failed')); return; }
                const btn = await waitFor(() => { const e = document.getElementById('rph-btn'); return e && e.offsetParent !== null ? e : null; }, 2500);
                if (!btn) { toast(t('module_off', { name: 'RPG Phone' })); return; }
                closeHub(); btn.click();
            });
            break;
        }
        case 'import': {
            // synchronously, inside the click: the file picker needs the user's gesture
            closeHub();
            const b = document.getElementById('character_import_button');
            if (b) b.click();
            break;
        }
        case 'create': openCharEdit(null); break;
        case 'ce-edit': openCharEdit(view.dossier); break;
        case 'ce-back': { const back = view.ce && view.ce.avatar; view.ce = null; if (back) openDossier(back); else { view.screen = 'deck'; render(); } break; }
        case 'ce-save': saveCharEdit(); break;
        case 'ce-del': deleteCharEdit(); break;
        case 'ce-fav': if (view.ce) { view.ce.fav = !view.ce.fav; render(); } break;
        case 'ce-open': if (view.ce) { view.ce.open = el.getAttribute('data-slip'); view.ce.wasFilled = !!(CE_SLIP_FILLED[view.ce.open] && CE_SLIP_FILLED[view.ce.open](view.ce)); render(); focusFirst('.fs-open textarea, .fs-open input'); } break;
        case 'ce-close': if (view.ce) { const k = view.ce.open; view.ce.open = null; view.ce.just = k && !view.ce.wasFilled && CE_SLIP_FILLED[k] && CE_SLIP_FILLED[k](view.ce) ? k : null; render(); if (view.ce.just) { sound('seal'); setTimeout(() => { if (view.ce) view.ce.just = null; }, 900); } } break;
        case 'ce-g-add': if (view.ce && view.ce.greetings.length < 50) { view.ce.greetings.push(''); render(); const ta = stageEl.querySelectorAll('textarea[data-act="ce-g"]'); if (ta.length) ta[ta.length - 1].focus({ preventScroll: true }); } break;
        case 'ce-g-del': if (view.ce) { view.ce.greetings.splice(Number(el.getAttribute('data-i')), 1); render(); } break;
        case 'ce-depth': if (view.ce) { view.ce.depth = Math.max(0, Math.min(999, view.ce.depth + (Number(el.getAttribute('data-d')) || 0))); const b = stageEl.querySelector('[data-n="depth"]'); if (b) b.textContent = view.ce.depth; } break;
        case 'ce-role': if (view.ce && DEPTH_ROLES.includes(el.getAttribute('data-r'))) { view.ce.role = el.getAttribute('data-r'); render(); } break;
        case 'ce-pic': { const f = stageEl.querySelector('input[data-act="ce-file"]'); if (f) f.click(); break; }
        default: break;
    }
}
let qTimer = 0;
function onInput(e) {
    const el = e.target;
    const act = el && el.getAttribute && el.getAttribute('data-act');
    if (act === 'ge-name' && view.ge) { view.ge.name = String(el.value || '').slice(0, 80); return; }
    if (act === 'y-name' || act === 'y-title') {
        const ed = view.yedit;
        const was = yDirty(ed);
        const e2 = ensureYEdit();
        e2[act === 'y-name' ? 'name' : 'title'] = String(el.value || '').slice(0, 100);
        if (was !== yDirty(e2)) { const pos = el.selectionStart; render(); const f = stageEl.querySelector(`input[data-act="${act}"]`); if (f) { f.focus({ preventScroll: true }); try { f.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } } }
        return;
    }
    if (act === 'y-desc' && view.yedit) { view.yedit.desc = String(el.value || '').slice(0, 20000); const n = stageEl.querySelector('.ce-n[data-n="ydesc"]'); if (n) n.textContent = view.yedit.desc.length || ''; return; }
    if (view.ce && act && act.startsWith('ce-')) {
        const ce = view.ce;
        if (act === 'ce-name') { ce.name = String(el.value || '').slice(0, 100); return; }
        if (act === 'ce-f') {
            const f = el.getAttribute('data-f');
            if (CE_TEXT.includes(f)) {
                ce.f[f] = String(el.value || '').slice(0, 60000);
                const n = stageEl.querySelector(`.ce-n[data-n="${f}"]`);
                if (n) n.textContent = ce.f[f].length || '';
            }
            return;
        }
        if (act === 'ce-g') { const i = Number(el.getAttribute('data-i')); if (i >= 0 && i < ce.greetings.length) ce.greetings[i] = String(el.value || '').slice(0, 60000); return; }
        if (act === 'ce-talk') { ce.talk = Math.max(0, Math.min(1, Number(el.value) || 0)); const b = stageEl.querySelector('[data-n="talk"]'); if (b) b.textContent = Math.round(ce.talk * 100) + '%'; return; }
    }
    if (act === 'tag-name' && view.tagEdit) { view.tagEdit.name = String(el.value || '').slice(0, 60); return; }
    if (act === 'ge-q' && view.ge) {
        clearTimeout(qTimer);
        qTimer = setTimeout(() => {
            if (!view.ge) return;
            view.ge.q = String(el.value || '').slice(0, 60); view.ge.page = 0;
            render();
            const f = stageEl.querySelector('input[data-act="ge-q"]');
            if (f) { f.focus({ preventScroll: true }); const n = f.value.length; try { f.setSelectionRange(n, n); } catch (x) { /* ignore */ } }
        }, 180);
        return;
    }
    if (act !== 'q') return;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
        view.deck.q = String(el.value || '').slice(0, 60);
        view.deck.page = 0;
        render();
        const q = stageEl.querySelector('input[data-act="q"]');
        if (q) { q.focus({ preventScroll: true }); const n = q.value.length; try { q.setSelectionRange(n, n); } catch (x) { /* ignore */ } }
    }, 180);
}
function onKey(e) {
    if (!isOpen) return;
    // typing into something that is not the menu (the phone over it) goes on as usual
    if (document.body.classList.contains('rpg-hub-dng')) return;   // the rabbit hole has the keys
    const t0 = e.target;
    if (t0 && t0 !== host && t0 !== document.body && t0 !== document.documentElement && !(host && host.contains(t0))) return;
    e.stopPropagation();   // SillyTavern's own hotkeys stay out while the menu is up
    const inField = root.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(root.activeElement.tagName);
    if (e.key === 'Escape') {
        e.preventDefault();
        if (view.pop) { view.pop = null; view.tagEdit = null; render(); return; }
        if (view.yedit && view.yedit.open) { view.yedit.open = null; render(); return; }
        if (view.yedit) { view.yedit = null; render(); return; }
        if (view.screen === 'char' && view.ce && view.ce.open) { view.ce.open = null; render(); return; }
        if (view.screen === 'char') { const back = view.ce && view.ce.avatar; view.ce = null; if (back) openDossier(back); else { view.screen = 'deck'; render(); } return; }
        if (view.panel && view.hopen) { view.hopen = null; render(); return; }
        if (view.panel === 'calendar' && view.pzoom != null) { view.pzoom = null; render(); return; }
        if (view.panel) { view.panel = null; render(); return; }
        if (view.screen === 'party') { leaveParty(); return; }
        if (view.screen === 'you' || view.screen === 'diary' || view.screen === 'map') { view.screen = 'main'; refresh(true); return; }
        if (view.screen === 'dossier' || view.screen === 'group') { view.screen = 'deck'; render(); return; }
        if (view.screen === 'deck') { view.screen = 'main'; render(); return; }
        closeHub();
        return;
    }
    if (view.panel && !inField && !view.hopen && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        const b = stageEl.querySelector(`.pn-wrap [data-act="pp"][data-dir="${e.key === 'ArrowRight' ? 1 : -1}"]`);
        if (b && !b.disabled) b.click();
        return;
    }
    if (view.screen === 'diary' && !view.panel && !inField && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        const b = stageEl.querySelector(`[data-act="d-page"][data-dir="${e.key === 'ArrowRight' ? 1 : -1}"]`);
        if (b && !b.disabled) b.click();
        return;
    }
    if (view.screen === 'deck' && !view.panel && !inField) {
        if (e.key === 'ArrowRight') { view.deck.page++; render(); }
        if (e.key === 'ArrowLeft') { view.deck.page--; render(); }
    }
}

/* ============================================================ SETTINGS PANEL */
function settingsHtml() {
    const opt = (v, cur, label) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
    return `
    <div class="inline-drawer-toggle inline-drawer-header"><b>Tavern Suite Menu</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
    <div class="inline-drawer-content">
        <div class="rhub-row"><label class="checkbox_label"><input type="checkbox" id="rhub-enabled" ${settings.enabled ? 'checked' : ''}><span>${esc(t('set_enabled'))}</span></label></div>
        <div class="rhub-row"><label class="checkbox_label"><input type="checkbox" id="rhub-startup" ${settings.onStartup ? 'checked' : ''}><span>${esc(t('set_startup'))}</span></label></div>
        <div class="rhub-row"><label for="rhub-bg">${esc(t('set_bg'))}</label><select id="rhub-bg" class="text_pole">${opt('scene', settings.bg, t('bg_scene'))}${opt('random', settings.bg, t('bg_random'))}${opt('st', settings.bg, t('bg_st'))}</select></div>
        <div class="rhub-hint">${esc(t('set_bg_hint'))}</div>
        <div class="rhub-row"><label>${esc(t('set_accent'))}</label><div class="rhub-swatches">${ACCENTS.map(c => `<span class="rhub-swatch${c === settings.accent ? ' on' : ''}" data-c="${c}" style="background:${c}" title="${c}" role="button" tabindex="0"></span>`).join('')}</div></div>
        <div class="rhub-row"><label for="rhub-motion">${esc(t('set_motion'))}</label><select id="rhub-motion" class="text_pole">${opt('full', settings.motion, t('motion_full'))}${opt('calm', settings.motion, t('motion_calm'))}</select></div>
        <div class="rhub-row"><label class="checkbox_label"><input type="checkbox" id="rhub-sound" ${settings.sound ? 'checked' : ''}><span>${esc(t('set_sound'))}</span></label><input type="range" id="rhub-volume" min="0" max="100" step="5" value="${settings.volume}" aria-label="${esc(t('set_volume'))}" style="flex:1;max-width:160px"></div>
        <div class="rhub-row"><label for="rhub-lang">${esc(t('set_lang'))}</label><select id="rhub-lang" class="text_pole">${opt('', settings.language, t('lang_auto'))}${opt('en', settings.language, 'English')}${opt('ru', settings.language, 'Русский')}</select></div>
        <div class="rhub-row"><div id="rhub-open" class="menu_button"><i class="fa-solid fa-crown"></i> ${esc(t('open_menu'))}</div></div>
    </div>`;
}
function renderSettings() {
    let box = document.getElementById('rpg-hub-settings');
    const wasOpen = box && box.querySelector('.inline-drawer-content') && getComputedStyle(box.querySelector('.inline-drawer-content')).display !== 'none';
    if (!box) {
        const parent = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
        if (!parent) return;
        box = document.createElement('div');
        box.id = 'rpg-hub-settings';
        box.className = 'rpg-hub-settings inline-drawer';
        parent.appendChild(box);
    }
    box.innerHTML = settingsHtml();
    if (wasOpen) { const c = box.querySelector('.inline-drawer-content'); if (c) c.style.display = 'block'; const ic = box.querySelector('.inline-drawer-icon'); if (ic) { ic.classList.remove('down', 'fa-circle-chevron-down'); ic.classList.add('up', 'fa-circle-chevron-up'); } }
    box.querySelector('#rhub-enabled').addEventListener('change', e => { settings.enabled = e.target.checked; save(); renderButton(); if (!settings.enabled) closeHub(); });
    box.querySelector('#rhub-startup').addEventListener('change', e => { settings.onStartup = e.target.checked; save(); });
    box.querySelector('#rhub-bg').addEventListener('change', e => { settings.bg = ['scene', 'random', 'st'].includes(e.target.value) ? e.target.value : 'scene'; view.bgOverride = null; save(); });
    box.querySelector('#rhub-sound').addEventListener('change', e => { settings.sound = e.target.checked; save(); if (settings.sound) sound('select'); });
    box.querySelector('#rhub-volume').addEventListener('change', e => { settings.volume = Math.max(0, Math.min(100, Number(e.target.value) || 0)); save(); sound('select'); });
    box.querySelector('#rhub-motion').addEventListener('change', e => { settings.motion = e.target.value === 'calm' ? 'calm' : 'full'; save(); });
    box.querySelector('#rhub-lang').addEventListener('change', e => { settings.language = ['en', 'ru'].includes(e.target.value) ? e.target.value : ''; save(); renderSettings(); renderButton(); });
    box.querySelectorAll('.rhub-swatch').forEach(s => {
        const pick = () => { if (ACCENTS.includes(s.dataset.c)) { settings.accent = s.dataset.c; save(); renderSettings(); } };
        s.addEventListener('click', pick);
        s.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    });
    box.querySelector('#rhub-open').addEventListener('click', () => openHub('main'));
}
/* a crown among SillyTavern's own icons at the top: one click and the menu is back */
function renderTopButton() {
    const bar = document.getElementById('top-settings-holder');
    if (!bar) return false;
    let b = document.getElementById('rpg-hub-top');
    if (!b) {
        b = document.createElement('div');
        b.id = 'rpg-hub-top';
        b.className = 'drawer';
        b.innerHTML = '<div class="rhub-top-toggle"><div class="drawer-icon fa-solid fa-crown fa-fw closedIcon interactable" role="button" tabindex="0"></div></div>';
        bar.appendChild(b);
        const ic = b.querySelector('.drawer-icon');
        ic.addEventListener('click', () => openHub('main'));
        ic.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openHub('main'); } });
    }
    const ic = b.querySelector('.drawer-icon');
    ic.title = t('open_menu');
    ic.setAttribute('aria-label', t('open_menu'));
    b.style.display = settings.enabled ? '' : 'none';
    return true;
}
function renderButton() {
    // the crown in the top bar is enough; the corner button is only for a layout without that bar
    if (renderTopButton()) { const old = document.getElementById('rpg-hub-btn'); if (old) old.remove(); return; }
    let c = document.getElementById('rpg-buttons-container');
    if (!c) {
        c = document.createElement('div');
        c.id = 'rpg-buttons-container';
        c.setAttribute('style', 'position:fixed; bottom:20px; right:20px; display:flex; gap:15px; z-index:3000;');
        document.body.appendChild(c);
    }
    let b = document.getElementById('rpg-hub-btn');
    if (!b) {
        b = document.createElement('div');
        b.id = 'rpg-hub-btn';
        b.className = 'rpg-floating-btn';
        b.setAttribute('role', 'button');
        b.tabIndex = 0;
        b.innerHTML = '<i class="fa-solid fa-crown"></i>';
        b.addEventListener('click', () => openHub('main'));
        b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openHub('main'); } });
        c.appendChild(b);
    }
    b.title = t('open_menu');
    b.setAttribute('aria-label', t('open_menu'));
    b.style.display = settings.enabled && getContext().chatId ? 'flex' : 'none';
}

/* ============================================================ INIT */
function onChatChanged() {
    renderButton();
    snapSoon();
    recentCache.at = 0;
    if (isOpen && view.screen === 'main') refresh(true);
}
jQuery(() => {
    loadSettings();
    renderSettings();
    renderButton();
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    [event_types.MESSAGE_RECEIVED, event_types.MESSAGE_EDITED, event_types.MESSAGE_SWIPED, event_types.MESSAGE_DELETED].forEach(ev => { if (ev) eventSource.on(ev, snapSoon); });
    window.addEventListener('rpg:scene-updated', snapSoon);
    // the menu comes up as SillyTavern finishes loading (APP_READY fires late listeners too)
    let shown = false;
    eventSource.on(event_types.APP_READY, () => {
        if (shown) return;
        shown = true;
        renderButton();
        if (settings.enabled && settings.onStartup) setTimeout(() => openHub('main'), 300);
    });
    try {
        const ctx = getContext();
        if (ctx.SlashCommandParser && ctx.SlashCommand) {
            ctx.SlashCommandParser.addCommandObject(ctx.SlashCommand.fromProps({
                name: 'hub',
                callback: () => { openHub('main'); return ''; },
                helpString: 'Open the Tavern Suite Menu menu.',
            }));
        }
    } catch (e) { /* older SillyTavern */ }
});
