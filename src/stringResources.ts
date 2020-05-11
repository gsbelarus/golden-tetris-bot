import { User } from "telegraf/typings/telegram-types";

interface ILocString {
  en?: string;
  ru?: string;
  be?: string;
};

const stringResources = {
  top40: {
    en: 'Top 40',
    ru: 'Лучшие 40',
    be: 'Найлепшыя 40'
  },
  history: {
    en: 'History',
    ru: 'История',
    be: 'Гісторыя'
  },
  playSolo: {
    en: 'Play solo',
    ru: 'Играть одному',
    be: 'Іграць аднаму'
  },
  playWithFriends: {
    en: 'Play with friends',
    ru: 'Играть с друзьями',
    be: 'Іграць з сябрамі'
  },
  visitGS: {
    en: 'Visit gsbelarus.com',
    ru: 'Посетить gsbelarus.com',
    be: 'Наведаць gsbelarus.com'
  },
  top40Header: {
    en: '#  Player              Score',
    ru: '#  Игрок               Рез-т',
    be: '#  Ігрок               Вынік'
  },
  noRes: {
    en: 'No results yet!',
    ru: 'Нет результатов!',
    be: 'Няма вынікаў!'
  },
  histFor: {
    en: 'History of play for ',
    ru: 'История игр ',
    be: 'Гісторыя гульняў '
  },
  histHeader: {
    en: 'Date       Score  Lvl Time',
    ru: 'Дата       Рез-т  Ур  Врем',
    be: 'Дата       Вынік  Узр Час '
  }
};

export type Lang = keyof ILocString;

export const getLocString = (id: keyof typeof stringResources, lang?: Lang) => stringResources[id]?.[lang ?? 'en'];

export const getUserLang = (user?: User) => user?.language_code?.slice(0, 2).toLowerCase() as Lang ?? 'en';