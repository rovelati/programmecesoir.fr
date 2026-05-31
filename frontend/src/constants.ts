
import { Channel } from './types';

export const COLORS = {
  primary: '#2563EB', // Electric Blue
  secondary: '#F97316', // Warm Orange
  success: '#10B981', // Green
  background: '#F8FAFC',
  text: '#1E293B',
};

// Mock data generator for Italian channels
const now = new Date();
const formatTime = (hours: number, minutes: number) => {
  const d = new Date(now);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
};

export const MOCK_CHANNELS: Channel[] = [
  {
    id: 'rai1',
    name: 'Rai 1',
    number: 1,
    logo: 'https://upload.wikimedia.org/wikipedia/commons/b/b3/Rai_1_%282016%29.svg',
    type: 'Generalista',
    color: '#005AAA',
    programs: [
      { id: 'p1', title: 'Uno Mattina', startTime: formatTime(6, 45), endTime: formatTime(9, 50), category: 'News', description: 'Informazione e attualità con i principali fatti del giorno dall\'Italia e dal mondo.' },
      { id: 'p1a', title: 'Storie Italiane', startTime: formatTime(9, 50), endTime: formatTime(11, 55), category: 'Attualità', description: 'Eleonora Daniele affronta temi sociali e di cronaca con testimonianze in studio.' },
      { id: 'p1', title: 'È sempre mezzogiorno!', startTime: formatTime(11, 55), endTime: formatTime(13, 30), category: 'Intrattenimento', description: 'Antonella Clerici cucina con i suoi ospiti nel bosco incantato di Rai 1.' },
      { id: 'p2', title: 'TG1 Edizione Ore 13:30', startTime: formatTime(13, 30), endTime: formatTime(14, 0), category: 'News', description: 'Il telegiornale di punta della rete ammiraglia Rai.' },
      { id: 'p3', title: 'La Volta Buona', startTime: formatTime(14, 0), endTime: formatTime(16, 0), category: 'Talk Show', description: 'Caterina Balivo ospita personaggi dello spettacolo e della cultura.' },
      { id: 'p4', title: 'Affari Tuoi', startTime: formatTime(20, 30), endTime: formatTime(21, 30), category: 'Game Show', description: 'Il celebre gioco dei pacchi condotto da Stefano De Martino.' },
      { id: 'p5', title: 'Doc - Nelle tue mani', startTime: formatTime(21, 30), endTime: formatTime(23, 30), category: 'Serie TV', description: 'Andrea Fanti cerca di ricostruire la sua vita dopo la perdita della memoria.' },
    ]
  },
  {
    id: 'canale5',
    name: 'Canale 5',
    number: 5,
    logo: 'https://upload.wikimedia.org/wikipedia/it/c/c5/Canale_5_logo_2018.svg',
    type: 'Generalista',
    color: '#FF7F00',
    programs: [
      { id: 'p6', title: 'Uomini e Donne', startTime: formatTime(14, 45), endTime: formatTime(16, 10), category: 'Talk Show', description: 'Il talk show dei sentimenti di Maria De Filippi.' },
      { id: 'p7', title: 'Verissimo', startTime: formatTime(16, 30), endTime: formatTime(18, 45), category: 'Talk Show', description: 'Silvia Toffanin intervista i protagonisti dello spettacolo.' },
      { id: 'p8', title: 'Striscia la notizia', startTime: formatTime(20, 40), endTime: formatTime(21, 30), category: 'Varietà', description: 'Il telegiornale satirico di Antonio Ricci.' },
      { id: 'p9', title: 'Grande Fratello', startTime: formatTime(21, 30), endTime: formatTime(23, 59), category: 'Reality', description: 'Diretta dalla casa più spiata d\'Italia con Alfonso Signorini.' },
    ]
  },
  {
    id: 'rai2',
    name: 'Rai 2',
    number: 2,
    logo: 'https://upload.wikimedia.org/wikipedia/commons/4/4e/Rai_2_%282016%29.svg',
    type: 'Generalista',
    programs: [
      { id: 'p10', title: 'I Fatti Vostri', startTime: formatTime(11, 10), endTime: formatTime(13, 0), category: 'Attualità', description: 'Cronaca, attualità e curiosità.' },
      { id: 'p11', title: 'Ore 14', startTime: formatTime(14, 0), endTime: formatTime(15, 30), category: 'Approfondimento', description: 'I fatti del giorno analizzati da Milo Infante.' },
      { id: 'p12', title: 'Stasera tutto è possibile', startTime: formatTime(21, 20), endTime: formatTime(23, 45), category: 'Varietà', description: 'Il comedy show dove l\'unica regola è divertirsi.' },
    ]
  },
  {
    id: 'italia1',
    name: 'Italia 1',
    number: 6,
    logo: 'https://upload.wikimedia.org/wikipedia/it/e/e0/Italia_1_logo_2018.svg',
    type: 'Generalista',
    programs: [
      { id: 'p13', title: 'I Simpson', startTime: formatTime(13, 45), endTime: formatTime(14, 35), category: 'Animazione', description: 'Le avventure della famiglia più gialla della TV.' },
      { id: 'p14', title: 'CSI: Miami', startTime: formatTime(15, 30), endTime: formatTime(17, 30), category: 'Serie TV', description: 'Indagini scientifiche sotto il sole di Miami.' },
      { id: 'p15', title: 'Le Iene', startTime: formatTime(21, 20), endTime: formatTime(23, 59), category: 'Inchiesta', description: 'Inviati d\'assalto tra inchieste e scherzi divertenti.' },
    ]
  },
  {
    id: 'la7',
    name: 'La7',
    number: 7,
    logo: 'https://upload.wikimedia.org/wikipedia/commons/0/02/LA7_-_Logo_2011.svg',
    type: 'Generalista',
    programs: [
      { id: 'p16', title: 'L\'Aria che Tira', startTime: formatTime(11, 0), endTime: formatTime(13, 30), category: 'Talk Show', description: 'Talk show di politica e economia.' },
      { id: 'p17', title: 'Tagadà', startTime: formatTime(14, 15), endTime: formatTime(17, 0), category: 'Talk Show', description: 'Tiziana Panella segue l\'attualità quotidiana.' },
      { id: 'p18', title: 'Piazza Pulita', startTime: formatTime(21, 15), endTime: formatTime(23, 59), category: 'Inchiesta', description: 'Conduce Corrado Formigli.' },
    ]
  },
  {
    id: 'rai4',
    name: 'Rai 4',
    number: 21,
    logo: 'https://upload.wikimedia.org/wikipedia/commons/1/15/Rai_4_%282016%29.svg',
    type: 'Tematico',
    programs: [
      { id: 'p19', title: 'Criminal Minds', startTime: formatTime(19, 30), endTime: formatTime(21, 10), category: 'Serie TV', description: 'L\'unità di analisi comportamentale dell\'FBI.' },
      { id: 'p20', title: 'Blade Runner 2049', startTime: formatTime(21, 10), endTime: formatTime(23, 50), category: 'Film', description: 'Il sequel del capolavoro sci-fi diretto da Denis Villeneuve.' },
    ]
  },
  {
    id: 'iris',
    name: 'Iris',
    number: 22,
    logo: 'https://upload.wikimedia.org/wikipedia/it/d/d4/IRIS_logo_2018.svg',
    type: 'Film',
    programs: [
      { id: 'p21', title: 'Full Metal Jacket', startTime: formatTime(21, 0), endTime: formatTime(23, 15), category: 'Film', description: 'La crudezza della guerra secondo Stanley Kubrick.' },
    ]
  },
  {
    id: 'tv8',
    name: 'TV8',
    number: 8,
    logo: 'https://upload.wikimedia.org/wikipedia/it/2/22/Logo_TV8_2022.svg',
    type: 'Generalista',
    programs: [
      { id: 'p22', title: 'Masterchef Italia', startTime: formatTime(21, 30), endTime: formatTime(23, 30), category: 'Talent Show', description: 'Aspiranti chef si sfidano ai fornelli.' },
    ]
  }
];
