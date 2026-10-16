export type Member = {
  id: string;
  name: string;
  label: string;
  color: string;
  isLeader?: boolean;
};

export type ItineraryItem = {
  id: string;
  date: string;
  time: string;
  endTime: string;
  endDate?: string;
  title: string;
  place: string;
  transport: string;
  description?: string;
  contact?: string;
  createdBy?: string;
  sourceActivityId?: string;
  memberIds: string[];
  status: "confirmed" | "optional";
  tone: "coral" | "blue" | "mint" | "gold";
};

export type Activity = {
  id: string;
  city: "悉尼" | "墨爾本";
  category: string;
  title: string;
  area: string;
  description: string;
  hours: string;
  travel: string;
  walking: "輕鬆" | "適中";
  image: string;
  imageAlt: string;
  sourceUrl: string;
  imageCredit: string;
  imageSourceUrl: string;
  createdBy?: string;
  proposedDate?: string;
  proposedEndDate?: string;
  startTime?: string;
  endTime?: string;
};

export type Proposal = {
  activityId: string;
  invitedIds: string[];
  votes: Record<string, "yes" | "maybe" | "no">;
  status: "voting" | "published";
  date?: string;
  endDate?: string;
  time?: string;
  endTime?: string;
  publishedItineraryId?: string;
};

export type TripState = {
  trip: {
    id: string;
    name: string;
    destination: string;
    startDate: string;
    endDate: string;
    timeZone?: string;
  };
  members: Member[];
  itinerary: ItineraryItem[];
  activities: Activity[];
  proposals: Proposal[];
};

export const initialTripState: TripState = {
  trip: {
    id: "demo-trip",
    name: "澳洲示範旅程",
    destination: "悉尼 → 墨爾本",
    startDate: "2030-01-01",
    endDate: "2030-01-11",
  },
  members: [
    { id: "leader", name: "團友一", label: "團長", color: "#ef6a54", isLeader: true },
    { id: "partner", name: "團友二", label: "同行", color: "#f0a14a" },
    { id: "dad", name: "團友三", label: "長輩", color: "#5178b8" },
    { id: "mum", name: "團友四", label: "長輩", color: "#7d68ad" },
    { id: "uncle", name: "團友五", label: "同行", color: "#3f8f83" },
    { id: "aunt", name: "團友六", label: "同行", color: "#bf6682" },
  ],
  itinerary: [
    {
      id: "breakfast",
      date: "2030-01-03",
      time: "08:30",
      endTime: "09:30",
      title: "酒店早餐・集合",
      place: "Sydney CBD",
      transport: "酒店內",
      memberIds: ["leader", "partner", "dad", "mum", "uncle", "aunt"],
      status: "confirmed",
      tone: "gold",
    },
    {
      id: "opera",
      date: "2030-01-03",
      time: "10:00",
      endTime: "12:00",
      title: "悉尼歌劇院與海港",
      place: "Bennelong Point",
      transport: "的士・約 12 分鐘",
      memberIds: ["leader", "partner", "dad", "mum", "uncle", "aunt"],
      status: "confirmed",
      tone: "coral",
    },
    {
      id: "lunch",
      date: "2030-01-03",
      time: "12:30",
      endTime: "14:00",
      title: "Circular Quay 午餐",
      place: "Circular Quay",
      transport: "步行・約 6 分鐘",
      memberIds: ["leader", "partner", "dad", "mum", "uncle", "aunt"],
      status: "confirmed",
      tone: "blue",
    },
    {
      id: "garden",
      date: "2030-01-03",
      time: "14:30",
      endTime: "16:00",
      title: "皇家植物園輕鬆散步",
      place: "Mrs Macquarie's Point",
      transport: "短程的士・約 8 分鐘",
      memberIds: ["dad", "mum", "uncle", "aunt"],
      status: "optional",
      tone: "mint",
    },
    {
      id: "coffee",
      date: "2030-01-03",
      time: "14:30",
      endTime: "16:00",
      title: "Surry Hills 咖啡巡遊",
      place: "Surry Hills",
      transport: "輕鐵＋步行・約 18 分鐘",
      memberIds: ["leader", "partner"],
      status: "optional",
      tone: "gold",
    },
    {
      id: "dinner",
      date: "2030-01-03",
      time: "18:30",
      endTime: "20:30",
      title: "全團晚餐",
      place: "Darling Harbour",
      transport: "的士・約 15 分鐘",
      memberIds: ["leader", "partner", "dad", "mum", "uncle", "aunt"],
      status: "confirmed",
      tone: "coral",
    },
  ],
  activities: [
    {
      id: "taronga",
      city: "悉尼",
      category: "動物與自然",
      title: "Taronga Zoo",
      area: "Mosman",
      description: "乘渡輪前往、沿途可看海港景色；可選擇較短的園內路線。",
      hours: "營業時間需出發前覆核",
      travel: "由 Circular Quay 約 20 分鐘渡輪",
      walking: "適中",
      image: "https://images.unsplash.com/photo-1564760055775-d63b17a55c44?auto=format&fit=crop&w=1200&q=80",
      imageAlt: "澳洲動物園內的長頸鹿",
      sourceUrl: "https://taronga.org.au/sydney-zoo",
      imageCredit: "Unsplash",
      imageSourceUrl: "https://unsplash.com/",
    },
    {
      id: "opera-house",
      city: "悉尼",
      category: "地標與拍照",
      title: "悉尼歌劇院",
      area: "Circular Quay",
      description: "悉尼代表性地標，適合海港散步、拍照及安排室內導賞。",
      hours: "公共範圍開放；導賞時間另查",
      travel: "由 Sydney CBD 約 12 分鐘車程",
      walking: "輕鬆",
      image: "https://commons.wikimedia.org/wiki/Special:FilePath/Sydney_Opera_House_and_Harbour_Bridge%2C_southeast_view_20230224_1.jpg",
      imageAlt: "從東南方向眺望悉尼歌劇院及海港大橋",
      sourceUrl: "https://www.sydneyoperahouse.com/",
      imageCredit: "DXR · CC BY-SA 4.0",
      imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Sydney_Opera_House_and_Harbour_Bridge,_southeast_view_20230224_1.jpg",
    },
    {
      id: "great-ocean-road",
      city: "墨爾本",
      category: "海岸公路",
      title: "大洋路・十二門徒石",
      area: "Port Campbell",
      description: "適合包車的一日海岸行程，可按長輩體力減少停靠點。",
      hours: "戶外景點；日落前抵達較理想",
      travel: "由 Melbourne CBD 單程約 3 小時",
      walking: "輕鬆",
      image: "https://commons.wikimedia.org/wiki/Special:FilePath/Twelve_Apostles%2C_Great_Ocean_Road%2C_Melbourne.jpg",
      imageAlt: "維多利亞大洋路十二門徒石的石灰岩海蝕柱",
      sourceUrl: "https://www.visitvictoria.com/regions/great-ocean-road",
      imageCredit: "Nicoleeeeee Li · CC0",
      imageSourceUrl: "https://commons.wikimedia.org/wiki/File:Twelve_Apostles,_Great_Ocean_Road,_Melbourne.jpg",
    },
  ],
  proposals: [
    {
      activityId: "taronga",
      invitedIds: ["leader", "partner", "dad", "mum", "uncle", "aunt"],
      votes: { leader: "yes", partner: "yes", uncle: "maybe" },
      status: "voting",
    },
  ],
};
