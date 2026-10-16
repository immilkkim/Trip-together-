"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Compass,
  ExternalLink,
  Heart,
  Home,
  ImagePlus,
  Link2,
  MapPin,
  Menu,
  PanelRightOpen,
  Pencil,
  Plus,
  Navigation,
  Search,
  Route,
  Sparkles,
  Trash2,
  Users,
  UserPlus,
  Vote,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Checkbox } from "@/components/ui/checkbox";
import { moveItineraryToBasket } from "@/lib/itinerary-actions";
import { addCalendarDays, effectiveEndDate, findScheduleConflicts, itineraryForDay, scheduleRangeLabel, shiftEndDate, validScheduleRange, type DailyItineraryItem, type ScheduleConflict } from "@/lib/schedule-conflicts";
import { defaultTripDate, tripLocalDate } from "@/lib/trip-date";
import { createTripMember } from "@/lib/members";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  initialTripState,
  type Activity,
  type ItineraryItem,
  type TripState,
} from "@/lib/trip-data";

type Section = "schedule" | "activities" | "votes";
type VoteChoice = "yes" | "maybe" | "no";

const dateFormatter = new Intl.DateTimeFormat("zh-HK", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const weekdayFormatter = new Intl.DateTimeFormat("zh-HK", { weekday: "short", timeZone: "UTC" });

function tripDates(start: string, end: string) {
  const days: Date[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function memberInitial(name: string) {
  return name.slice(0, 1).toLocaleUpperCase();
}

function normalizeState(value: TripState): TripState {
  const activities = Array.isArray(value.activities) ? value.activities : [];
  return {
    ...value,
    members: Array.isArray(value.members) ? value.members : initialTripState.members,
    itinerary: Array.isArray(value.itinerary) ? value.itinerary : [],
    activities,
    proposals: (Array.isArray(value.proposals) ? value.proposals : []).map((proposal) => {
      const legacyStatus = (proposal as unknown as { status?: string }).status;
      const activity = activities.find((item) => item.id === proposal.activityId);
      return {
        ...proposal,
        status: legacyStatus === "confirmed" || legacyStatus === "published" ? "published" : "voting",
        date: proposal.date ?? activity?.proposedDate,
        time: proposal.time ?? activity?.startTime,
        endTime: proposal.endTime ?? activity?.endTime,
        endDate: proposal.endDate ?? (!proposal.date || proposal.date === activity?.proposedDate ? activity?.proposedEndDate : undefined),
      };
    }),
  };
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value: number) {
  const safe = Math.max(0, Math.min(value, 23 * 60 + 59));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

type ItineraryDraft = {
  id?: string;
  sourceActivityId?: string;
  date: string;
  endDate: string;
  title: string;
  startTime: string;
  endTime: string;
  place: string;
  transport: string;
  description: string;
  contact: string;
  memberIds: string[];
  status: ItineraryItem["status"];
  tone: ItineraryItem["tone"];
};

type ActivityDraft = {
  id?: string;
  title: string;
  city: Activity["city"];
  category: string;
  area: string;
  description: string;
  hours: string;
  travel: string;
  walking: Activity["walking"];
  sourceUrl: string;
  image: string;
  imageAlt: string;
  imageCredit: string;
  imageSourceUrl: string;
  proposedDate: string;
  proposedEndDate: string;
  startTime: string;
  endTime: string;
  createdBy?: string;
};

type PendingConflictVote = {
  activityId: string;
  conflicts: ItineraryItem[];
};

const TIMELINE_START = 6 * 60;
const TIMELINE_END = 24 * 60;
const HOUR_HEIGHT = 96;

type PositionedItem = {
  item: ItineraryItem;
  top: number;
  height: number;
  left: number;
  width: number;
};

function layoutTimelineItems(items: ItineraryItem[], timelineStart = TIMELINE_START): PositionedItem[] {
  const sorted = [...items]
    .map((item) => ({ item, start: Math.max(timeToMinutes(item.time), timelineStart), end: Math.min(timeToMinutes(item.endTime), TIMELINE_END) }))
    .filter(({ start, end }) => end > start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const positioned: PositionedItem[] = [];
  let cluster: typeof sorted = [];
  let clusterEnd = -1;

  const placeCluster = () => {
    if (!cluster.length) return;
    const active: Array<{ end: number; column: number }> = [];
    const assigned = cluster.map((entry) => {
      for (let index = active.length - 1; index >= 0; index--) {
        if (active[index].end <= entry.start) active.splice(index, 1);
      }
      const used = new Set(active.map((value) => value.column));
      let column = 0;
      while (used.has(column)) column++;
      active.push({ end: entry.end, column });
      return { ...entry, column };
    });
    const columnCount = Math.max(...assigned.map((entry) => entry.column)) + 1;
    assigned.forEach(({ item, start, end, column }) => positioned.push({
      item,
      top: ((start - timelineStart) / 60) * HOUR_HEIGHT,
      height: ((end - start) / 60) * HOUR_HEIGHT,
      left: (column / columnCount) * 100,
      width: 100 / columnCount,
    }));
  };

  sorted.forEach((entry) => {
    if (cluster.length && entry.start >= clusterEnd) {
      placeCluster();
      cluster = [];
      clusterEnd = -1;
    }
    cluster.push(entry);
    clusterEnd = Math.max(clusterEnd, entry.end);
  });
  placeCluster();
  return positioned;
}

function activityScheduleLabel(activity: Activity) {
  return activity.proposedDate && activity.startTime && activity.endTime
    ? scheduleRangeLabel({ date: activity.proposedDate, time: activity.startTime, endTime: activity.endTime, endDate: activity.proposedEndDate })
    : "時間待定";
}

function statusLabel(status: ItineraryItem["status"]) {
  return status === "confirmed" ? "已確認" : "自由選擇";
}

export default function TripApp({ inviteTokenOverride }: { inviteTokenOverride?: string }) {
  const [state, setState] = useState<TripState>(initialTripState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const savingRef = useRef(false);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [newMemberOpen, setNewMemberOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [section, setSection] = useState<Section>("schedule");
  const [selectedDate, setSelectedDate] = useState(initialTripState.trip.startDate);
  const [memberFilter, setMemberFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("全部");
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [inviteSelection, setInviteSelection] = useState<string[]>([]);
  const [invalidInvite, setInvalidInvite] = useState(false);
  const [basketOpen, setBasketOpen] = useState(false);
  const [itineraryDraft, setItineraryDraft] = useState<ItineraryDraft | null>(null);
  const [detailItineraryId, setDetailItineraryId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ItineraryItem | null>(null);
  const [returnToBasketOpen, setReturnToBasketOpen] = useState(false);
  const [returnBasketCity, setReturnBasketCity] = useState<Activity["city"]>("悉尼");
  const [activityDraft, setActivityDraft] = useState<ActivityDraft | null>(null);
  const [activityPhoto, setActivityPhoto] = useState<File | null>(null);
  const [activityPhotoPreview, setActivityPhotoPreview] = useState("");
  const [activityDeleteTarget, setActivityDeleteTarget] = useState<Activity | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [proposalDate, setProposalDate] = useState(selectedDate);
  const [proposalEndDate, setProposalEndDate] = useState("");
  const [proposalStart, setProposalStart] = useState("09:00");
  const [proposalEnd, setProposalEnd] = useState("11:00");
  const [pendingConflictVote, setPendingConflictVote] = useState<PendingConflictVote | null>(null);
  const [scheduleConflicts, setScheduleConflicts] = useState<ScheduleConflict[]>([]);
  const [nameDraft, setNameDraft] = useState("");

  const inviteToken = useMemo(() => {
    if (typeof window === "undefined") return "";
    if (inviteTokenOverride) {
      window.localStorage.setItem("trip-together-invite", inviteTokenOverride);
      return inviteTokenOverride;
    }
    const fromUrl = new URLSearchParams(window.location.search).get("invite");
    if (fromUrl) {
      window.localStorage.setItem("trip-together-invite", fromUrl);
      return fromUrl;
    }
    const remembered = window.localStorage.getItem("trip-together-invite");
    if (remembered) return remembered;
    return "";
  }, [inviteTokenOverride]);

  useEffect(() => {
    const savedMember = window.localStorage.getItem("trip-together-member");
    if (savedMember) setMemberId(savedMember);
    else setIdentityOpen(true);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!inviteToken) {
      setInvalidInvite(true);
      setLoading(false);
      return;
    }
    const loadTrip = (next: TripState) => {
      const date = defaultTripDate(next.trip);
      setState(next);
      setSelectedDate(date);
      setProposalDate(date);
    };
    fetch("/api/state", { headers: { "x-trip-invite": inviteToken } })
      .then(async (response) => {
        if (response.status === 403) throw new Error("invalid");
        return response.json() as Promise<{ state?: TripState; revision?: number }>;
      })
      .then((data) => {
        if (data.state) {
          const normalized = normalizeState(data.state as TripState);
          loadTrip(normalized);
          window.localStorage.setItem("trip-together-offline-state", JSON.stringify(normalized));
        }
        setRevision(data.revision ?? 0);
      })
      .catch((error) => {
        if (error instanceof Error && error.message === "invalid") setInvalidInvite(true);
        else {
          const cached = window.localStorage.getItem("trip-together-offline-state");
          if (cached) {
            try { loadTrip(normalizeState(JSON.parse(cached) as TripState)); } catch { loadTrip(initialTripState); }
          } else {
            loadTrip(initialTripState);
          }
        }
      })
      .finally(() => setLoading(false));
  }, [inviteToken]);

  const persist = useCallback(
    async (next: TripState, previous: TripState, onSaved?: () => void) => {
      setSaving(true);
      try {
        const response = await fetch("/api/state", {
          method: "PUT",
          headers: { "content-type": "application/json", "x-trip-invite": inviteToken },
          body: JSON.stringify({ state: next, revision }),
        });
        if (!response.ok) {
          const failure = await response.json() as { error?: string; conflicts?: ScheduleConflict[] };
          if (failure.conflicts?.length) setScheduleConflicts(failure.conflicts);
          throw new Error(failure.error ?? "暫時未能同步，請稍後再試");
        }
        const data = await response.json() as { revision?: number };
        setRevision(data.revision ?? revision + 1);
        onSaved?.();
        toast.success("已同步給所有團友");
      } catch (error) {
        // Restore the authoritative state so rejected edits do not remain visible.
        let restored = previous;
        try {
          const response = await fetch("/api/state", { headers: { "x-trip-invite": inviteToken } });
          if (!response.ok) throw new Error("reload failed");
          const data = await response.json() as { state?: TripState; revision?: number; demo?: boolean };
          if (!data.state || data.demo) throw new Error("reload failed");
          restored = normalizeState(data.state);
          setRevision(data.revision ?? revision);
        } catch { /* Keep the last known state if the network is unavailable. */ }
        stateRef.current = restored;
        setState(restored);
        window.localStorage.setItem("trip-together-offline-state", JSON.stringify(restored));
        toast.error(error instanceof Error ? error.message : "暫時未能同步，請稍後再試");
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [inviteToken, revision],
  );

  const updateState = useCallback(
    (updater: (current: TripState) => TripState, onSaved?: () => void) => {
      if (savingRef.current) {
        toast.warning("正在同步，請稍候再修改");
        return false;
      }
      const current = stateRef.current;
      const next = updater(current);
      if (next === current) return false;
      savingRef.current = true;
      stateRef.current = next;
      setState(next);
      window.localStorage.setItem("trip-together-offline-state", JSON.stringify(next));
      void persist(next, current, onSaved);
      return true;
    },
    [persist],
  );

  const selectIdentity = (id: string) => {
    window.localStorage.setItem("trip-together-member", id);
    setMemberId(id);
    setNameDraft(state.members.find((member) => member.id === id)?.name ?? "");
    setIdentityOpen(false);
    toast.success("歡迎加入澳洲之旅");
  };

  const saveMemberName = () => {
    if (!memberId || !nameDraft.trim()) {
      toast.error("請輸入名字");
      return;
    }
    if (!updateState((current) => ({
      ...current,
      members: current.members.map((member) => member.id === memberId ? { ...member, name: nameDraft.trim().slice(0, 24) } : member),
    }))) return;
    setIdentityOpen(false);
    toast.success("名字已更新");
  };

  const openNewMember = () => {
    setNewMemberName("");
    setIdentityOpen(false);
    setNewMemberOpen(true);
  };

  const closeNewMember = () => {
    if (savingRef.current) return;
    setNewMemberOpen(false);
    if (!memberId) setIdentityOpen(true);
  };

  const saveNewMember = () => {
    try {
      const member = createTripMember(stateRef.current.members, newMemberName, `member-${crypto.randomUUID()}`);
      updateState((current) => ({ ...current, members: [...current.members, member] }), () => {
        setNewMemberOpen(false);
        setNewMemberName("");
        if (!memberId) {
          window.localStorage.setItem("trip-together-member", member.id);
          setMemberId(member.id);
          setNameDraft(member.name);
        }
        toast.success(`已新增團友「${member.name}」`);
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "暫時未能新增團友");
    }
  };

  const castVote = useCallback(
    (activityId: string, choice: VoteChoice) => {
      if (!memberId) {
        setIdentityOpen(true);
        return;
      }
      updateState((current) => ({
        ...current,
        proposals: current.proposals.map((proposal) =>
          proposal.activityId === activityId
            ? { ...proposal, votes: { ...proposal.votes, [memberId]: choice } }
            : proposal,
        ),
      }));
    },
    [memberId, updateState],
  );

  const requestVote = useCallback((activityId: string, choice: VoteChoice) => {
    if (!memberId) {
      setIdentityOpen(true);
      return;
    }
    const proposal = state.proposals.find((item) => item.activityId === activityId);
    if (!proposal?.invitedIds.includes(memberId)) {
      toast.error("你不在這次邀請名單內");
      return;
    }
    if (choice !== "yes") {
      castVote(activityId, choice);
      return;
    }
    if (!proposal.date || !proposal.time || !proposal.endTime) {
      toast.warning("活動尚未設定日期及時間，暫時無法檢查撞期");
      castVote(activityId, choice);
      return;
    }
    const conflicts = findScheduleConflicts(state.itinerary.filter((item) => item.sourceActivityId !== activityId), {
      id: proposal.publishedItineraryId ?? `vote-${activityId}`, date: proposal.date, time: proposal.time,
      endDate: proposal.endDate, endTime: proposal.endTime, memberIds: [memberId],
    }).map((conflict) => conflict.item);
    if (conflicts.length) {
      setPendingConflictVote({ activityId, conflicts });
      return;
    }
    castVote(activityId, choice);
  }, [castVote, memberId, state.itinerary, state.proposals]);

  const startProposal = (activity: Activity) => {
    if (!memberId) {
      setIdentityOpen(true);
      return;
    }
    const range = { date: proposalDate, time: proposalStart, endTime: proposalEnd, endDate: proposalEndDate };
    if (!validScheduleRange(range, state.trip)) {
      toast.error("請設定正確的活動日期及時間");
      return;
    }
    const invited = inviteSelection.length ? inviteSelection : state.members.map((member) => member.id);
    if (!updateState((current) => {
      const existing = current.proposals.some((proposal) => proposal.activityId === activity.id);
      return existing
        ? {
            ...current,
            proposals: current.proposals.map((proposal) =>
              proposal.activityId === activity.id ? {
                ...proposal,
                invitedIds: invited,
                votes: proposal.status === "published" ? {} : Object.fromEntries(Object.entries(proposal.votes).filter(([id]) => invited.includes(id))),
                date: proposalDate,
                time: proposalStart,
                endTime: proposalEnd,
                endDate: effectiveEndDate(range),
                status: "voting",
              } : proposal,
            ),
          }
        : {
            ...current,
            proposals: [
              ...current.proposals,
              {
                activityId: activity.id,
                invitedIds: invited,
                votes: {},
                status: "voting",
                date: proposalDate,
                time: proposalStart,
                endTime: proposalEnd,
                endDate: effectiveEndDate(range),
              },
            ],
          };
    })) return;
    setSelectedActivity(null);
    setSection("votes");
  };

  const publishProposal = (activityId: string) => {
    if (!state.members.find((member) => member.id === memberId)?.isLeader) {
      toast.error("只有團長可以發布活動");
      return;
    }
    const proposal = state.proposals.find((item) => item.activityId === activityId);
    const activity = state.activities.find((item) => item.id === activityId);
    if (!proposal || !activity || !proposal.date || !proposal.time || !proposal.endTime) {
      toast.error("請先設定活動日期及時間");
      return;
    }
    const attendingIds = proposal.invitedIds.filter((id) => proposal.votes[id] === "yes");
    if (!attendingIds.length) {
      toast.error("暫時未有團友選擇參加");
      return;
    }
    const itineraryId = proposal.publishedItineraryId ?? `proposal-${activityId}`;
    const publishedItem: ItineraryItem = {
      id: itineraryId,
      date: proposal.date,
      time: proposal.time,
      endTime: proposal.endTime,
      endDate: effectiveEndDate({ date: proposal.date, time: proposal.time, endTime: proposal.endTime, endDate: proposal.endDate }),
      title: activity.title,
      place: activity.area,
      transport: activity.travel,
      description: activity.description,
      contact: activity.sourceUrl,
      createdBy: activity.createdBy ?? memberId ?? undefined,
      sourceActivityId: activityId,
      memberIds: attendingIds,
      status: "confirmed",
      tone: "coral",
    };
    const conflicts = findScheduleConflicts(state.itinerary, publishedItem);
    if (conflicts.length) {
      setScheduleConflicts(conflicts);
      return;
    }
    if (!updateState((current) => ({
      ...current,
      itinerary: [
        ...current.itinerary.filter((item) => item.id !== itineraryId),
        publishedItem,
      ].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
      proposals: current.proposals.map((item) => item.activityId === activityId ? {
        ...item,
        status: "published",
        publishedItineraryId: itineraryId,
      } : item),
    }))) return;
    setSelectedDate(proposal.date);
    setSection("schedule");
    toast.success("活動已發布到參加者的每日行程");
  };

  const canManageItem = useCallback((item: ItineraryItem) => {
    const member = state.members.find((value) => value.id === memberId);
    return Boolean(member?.isLeader || (memberId && item.memberIds.includes(memberId)));
  }, [memberId, state.members]);

  const canManageActivity = useCallback((activity: Activity) => {
    const member = state.members.find((value) => value.id === memberId);
    const invited = state.proposals.some((proposal) => proposal.activityId === activity.id && Boolean(memberId) && proposal.invitedIds.includes(memberId!));
    return Boolean(member?.isLeader || activity.createdBy === memberId || invited);
  }, [memberId, state.members, state.proposals]);

  const openActivityDetails = (activity: Activity) => {
    setSelectedActivity(activity);
    setInviteSelection(state.members.map((member) => member.id));
    setProposalDate(activity.proposedDate ?? selectedDate);
    setProposalEndDate(activity.proposedEndDate && activity.proposedEndDate !== activity.proposedDate ? activity.proposedEndDate : "");
    setProposalStart(activity.startTime ?? "09:00");
    setProposalEnd(activity.endTime ?? "11:00");
  };

  const resetActivityPhoto = () => {
    if (activityPhotoPreview.startsWith("blob:")) URL.revokeObjectURL(activityPhotoPreview);
    setActivityPhoto(null);
    setActivityPhotoPreview("");
  };

  const openNewActivity = () => {
    if (!memberId) {
      setIdentityOpen(true);
      return;
    }
    resetActivityPhoto();
    setActivityDraft({
      title: "",
      city: "悉尼",
      category: "自訂活動",
      area: "",
      description: "",
      hours: "",
      travel: "",
      walking: "輕鬆",
      sourceUrl: "",
      image: "",
      imageAlt: "",
      imageCredit: "團友上載",
      imageSourceUrl: "",
      proposedDate: selectedDate,
      proposedEndDate: "",
      startTime: "09:00",
      endTime: "11:00",
      createdBy: memberId,
    });
  };

  const openEditActivity = (activity: Activity) => {
    if (!canManageActivity(activity)) {
      toast.error("只有建立者、團長或受邀團友可以修改此活動");
      return;
    }
    resetActivityPhoto();
    setActivityDraft({
      id: activity.id,
      title: activity.title,
      city: activity.city,
      category: activity.category,
      area: activity.area,
      description: activity.description,
      hours: activity.hours,
      travel: activity.travel,
      walking: activity.walking,
      sourceUrl: activity.sourceUrl,
      image: activity.image,
      imageAlt: activity.imageAlt,
      imageCredit: activity.imageCredit,
      imageSourceUrl: activity.imageSourceUrl,
      proposedDate: activity.proposedDate ?? selectedDate,
      proposedEndDate: activity.proposedEndDate && activity.proposedEndDate !== activity.proposedDate ? activity.proposedEndDate : "",
      startTime: activity.startTime ?? "09:00",
      endTime: activity.endTime ?? "11:00",
      createdBy: activity.createdBy,
    });
    setActivityPhotoPreview(activity.image);
  };

  const chooseActivityPhoto = (file?: File) => {
    if (!file) return;
    if (!(["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      toast.error("只支援 JPG、PNG 或 WebP 相片");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("相片不可大於 5 MB");
      return;
    }
    if (activityPhotoPreview.startsWith("blob:")) URL.revokeObjectURL(activityPhotoPreview);
    setActivityPhoto(file);
    setActivityPhotoPreview(URL.createObjectURL(file));
  };

  const removeUploadedPhoto = async (url: string) => {
    const match = url.match(/^\/api\/uploads\/([^/?#]+)$/);
    if (!match) return;
    await fetch(`/api/uploads/${match[1]}`, {
      method: "DELETE",
      headers: { "x-trip-invite": inviteToken },
    }).catch(() => undefined);
  };

  const saveActivity = async () => {
    if (!activityDraft || !memberId) return;
    if (!activityDraft.title.trim()) {
      toast.error("請輸入活動名稱");
      return;
    }
    const range = { date: activityDraft.proposedDate, time: activityDraft.startTime, endTime: activityDraft.endTime, endDate: activityDraft.proposedEndDate };
    if (!validScheduleRange(range, state.trip)) {
      toast.error("請設定正確的活動日期及時間");
      return;
    }

    let image = activityDraft.image;
    const previousImage = activityDraft.image;
    if (activityPhoto) {
      setUploadingPhoto(true);
      try {
        const form = new FormData();
        form.append("photo", activityPhoto);
        const response = await fetch("/api/uploads", {
          method: "POST",
          headers: { "x-trip-invite": inviteToken },
          body: form,
        });
        const data = await response.json() as { error?: string; url?: string };
        if (!response.ok) throw new Error(data.error ?? "相片上載失敗");
        if (!data.url) throw new Error("相片上載失敗");
        image = data.url;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "相片上載失敗");
        setUploadingPhoto(false);
        return;
      }
      setUploadingPhoto(false);
    }

    const nextActivity: Activity = {
      id: activityDraft.id ?? `activity-${Date.now()}`,
      city: activityDraft.city,
      category: activityDraft.category.trim() || "自訂活動",
      title: activityDraft.title.trim(),
      area: activityDraft.area.trim(),
      description: activityDraft.description.trim(),
      hours: activityDraft.hours.trim(),
      travel: activityDraft.travel.trim(),
      walking: activityDraft.walking,
      image,
      imageAlt: activityDraft.imageAlt.trim() || activityDraft.title.trim(),
      sourceUrl: activityDraft.sourceUrl.trim(),
      imageCredit: image.startsWith("/api/uploads/") ? "團友上載" : activityDraft.imageCredit,
      imageSourceUrl: image.startsWith("/api/uploads/") ? "" : activityDraft.imageSourceUrl,
      proposedDate: activityDraft.proposedDate,
      startTime: activityDraft.startTime,
      endTime: activityDraft.endTime,
      proposedEndDate: effectiveEndDate(range),
      createdBy: activityDraft.createdBy ?? memberId,
    };
    if (!updateState((current) => ({
      ...current,
      activities: [...current.activities.filter((activity) => activity.id !== nextActivity.id), nextActivity],
      proposals: current.proposals.map((proposal) => proposal.activityId === nextActivity.id && proposal.status === "voting" ? {
        ...proposal,
        date: nextActivity.proposedDate,
        time: nextActivity.startTime,
        endTime: nextActivity.endTime,
        endDate: nextActivity.proposedEndDate,
      } : proposal),
    }), () => { if (activityPhoto && previousImage && previousImage !== image) void removeUploadedPhoto(previousImage); })) return;
    resetActivityPhoto();
    setActivityDraft(null);
    toast.success(activityDraft.id ? "活動籃子項目已更新" : "活動已加入活動籃子");
  };

  const requestDeleteActivity = (activity: Activity) => {
    if (!canManageActivity(activity)) {
      toast.error("只有建立者、團長或受邀團友可以刪除此活動");
      return;
    }
    setActivityDeleteTarget(activity);
  };

  const deleteActivity = () => {
    if (!activityDeleteTarget) return;
    if (!updateState((current) => ({
      ...current,
      activities: current.activities.filter((activity) => activity.id !== activityDeleteTarget.id),
      proposals: current.proposals.filter((proposal) => proposal.activityId !== activityDeleteTarget.id),
    }), () => { void removeUploadedPhoto(activityDeleteTarget.image); })) return;
    setSelectedActivity(null);
    setActivityDeleteTarget(null);
    toast.success("活動已從活動籃子刪除");
  };

  const openNewItinerary = (activity?: Activity, droppedTime?: string, selectedMemberIds?: string[]) => {
    if (!memberId) {
      setIdentityOpen(true);
      return;
    }
    const startTime = droppedTime ?? activity?.startTime ?? "09:00";
    const start = timeToMinutes(startTime);
    const suggestedDate = activity?.proposedDate;
    const date = !droppedTime && suggestedDate && suggestedDate >= state.trip.startDate && suggestedDate <= state.trip.endDate ? suggestedDate : selectedDate;
    let duration = 120;
    if (activity?.startTime && activity?.endTime) {
      const range = { date: suggestedDate ?? date, time: activity.startTime, endTime: activity.endTime, endDate: activity.proposedEndDate };
      const minutes = (Date.parse(`${effectiveEndDate(range)}T${range.endTime}:00Z`) - Date.parse(`${range.date}T${range.time}:00Z`)) / 60000;
      if (minutes > 0) duration = minutes;
    }
    const endDate = addCalendarDays(date, Math.floor((start + duration) / 1440));
    setItineraryDraft({
      sourceActivityId: activity?.id,
      date,
      endDate: endDate !== date ? endDate : "",
      title: activity?.title ?? "",
      startTime,
      endTime: minutesToTime((start + duration) % 1440),
      place: activity?.area ?? "",
      transport: activity?.travel ?? "",
      description: activity?.description ?? "",
      contact: activity?.sourceUrl ?? "",
      memberIds: selectedMemberIds ?? [memberId],
      status: "optional",
      tone: activity ? "coral" : "blue",
    });
  };

  const openEditItinerary = (item: ItineraryItem) => {
    if (!canManageItem(item)) {
      toast.error("只有團長或相關團友可以修改此活動");
      return;
    }
    setItineraryDraft({
      id: item.id,
      sourceActivityId: item.sourceActivityId,
      date: item.date,
      endDate: effectiveEndDate(item) !== item.date ? effectiveEndDate(item) : "",
      title: item.title,
      startTime: item.time,
      endTime: item.endTime,
      place: item.place,
      transport: item.transport,
      description: item.description ?? "",
      contact: item.contact ?? "",
      memberIds: item.memberIds,
      status: item.status,
      tone: item.tone,
    });
  };

  const buildItineraryItem = (): ItineraryItem | null => {
    if (!itineraryDraft || !memberId) return null;
    const original = state.itinerary.find((item) => item.id === itineraryDraft.id);
    if (itineraryDraft.id && (!original || !canManageItem(original))) {
      toast.error("你已沒有權限修改此活動");
      return null;
    }
    if (!itineraryDraft.title.trim()) {
      toast.error("請輸入活動名稱");
      return null;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(itineraryDraft.date) || itineraryDraft.date < state.trip.startDate || itineraryDraft.date > state.trip.endDate) {
      toast.error("請選擇旅程範圍內的日期");
      return null;
    }
    const range = { date: itineraryDraft.date, time: itineraryDraft.startTime, endTime: itineraryDraft.endTime, endDate: itineraryDraft.endDate };
    if (!validScheduleRange(range, state.trip)) {
      toast.error("請設定正確的開始／結束日期及時間，並保持在旅程範圍內");
      return null;
    }
    if (!itineraryDraft.id && !itineraryDraft.memberIds.length) {
      toast.error("請至少剔選一位成員");
      return null;
    }
    return {
      ...original,
      id: itineraryDraft.id ?? `custom-${Date.now()}`,
      date: itineraryDraft.date,
      time: itineraryDraft.startTime,
      endTime: itineraryDraft.endTime,
      endDate: effectiveEndDate(range),
      title: itineraryDraft.title.trim(),
      place: itineraryDraft.place.trim(),
      transport: itineraryDraft.transport.trim(),
      description: itineraryDraft.description.trim(),
      contact: itineraryDraft.contact.trim(),
      memberIds: itineraryDraft.memberIds,
      status: itineraryDraft.status,
      tone: itineraryDraft.tone,
      createdBy: original?.createdBy ?? memberId,
      sourceActivityId: itineraryDraft.sourceActivityId,
    };
  };

  const saveItinerary = () => {
    const nextItem = buildItineraryItem();
    if (!nextItem) return;
    const conflicts = findScheduleConflicts(state.itinerary, nextItem);
    if (conflicts.length) {
      setScheduleConflicts(conflicts);
      return;
    }
    if (!updateState((current) => ({
      ...current,
      itinerary: [
        ...current.itinerary.filter((item) => item.id !== nextItem.id),
        nextItem,
      ].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)),
      proposals: current.proposals.map((proposal) => proposal.publishedItineraryId === nextItem.id ? { ...proposal, date: nextItem.date, time: nextItem.time, endTime: nextItem.endTime, endDate: nextItem.endDate } : proposal),
    }))) return;
    setSelectedDate(nextItem.date);
    setSection("schedule");
    setItineraryDraft(null);
    toast.success(itineraryDraft?.id ? "活動已更新" : "活動已加入行程");
  };

  const requestReturnToBasket = () => {
    const item = buildItineraryItem();
    if (!item || !itineraryDraft?.id) return;
    setReturnBasketCity(state.activities.find((activity) => activity.id === item.sourceActivityId)?.city ?? "悉尼");
    setReturnToBasketOpen(true);
  };

  const returnToBasket = () => {
    const item = buildItineraryItem();
    if (!item || !memberId) return;
    const activityId = `returned-${crypto.randomUUID()}`;
    if (!updateState((current) => moveItineraryToBasket(current, item, returnBasketCity, memberId, activityId))) return;
    setReturnToBasketOpen(false);
    setItineraryDraft(null);
    setSection("activities");
    toast.success("活動已移回活動籃子");
  };

  const requestDeleteItinerary = (item: ItineraryItem) => {
    if (!canManageItem(item)) {
      toast.error("只有團長或相關團友可以刪除此活動");
      return;
    }
    setDeleteTarget(item);
  };

  const deleteItinerary = () => {
    if (!deleteTarget) return;
    if (!updateState((current) => ({ ...current, itinerary: current.itinerary.filter((item) => item.id !== deleteTarget.id) }))) return;
    setDeleteTarget(null);
    toast.success("活動已刪除");
  };

  useEffect(() => {
    const context = typeof document === "undefined" ? undefined : document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool(
        {
          name: "read_trip_day",
          title: "查看團隊每日行程",
          description: "按日期讀取所有團友的已確認及自由活動。",
          inputSchema: {
            type: "object",
            properties: { date: { type: "string", description: "YYYY-MM-DD" } },
            required: ["date"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute(input: unknown) {
            const date = (input as { date?: string })?.date;
            if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("請提供正確日期");
            return { date, items: itineraryForDay(state.itinerary, date) };
          },
        },
        { signal: lifecycle.signal },
      );
      await context.registerTool(
        {
          name: "cast_activity_vote",
          title: "活動投票",
          description: "以目前選擇的團友身份，對活動投下參加、未決定或不參加。",
          inputSchema: {
            type: "object",
            properties: {
              activityId: { type: "string" },
              choice: { type: "string", enum: ["yes", "maybe", "no"] },
            },
            required: ["activityId", "choice"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input: unknown) {
            const value = input as { activityId?: string; choice?: VoteChoice };
            if (!value.activityId || !value.choice || !memberId) throw new Error("請先選擇團友身份");
            castVote(value.activityId, value.choice);
            return { activityId: value.activityId, memberId, choice: value.choice };
          },
        },
        { signal: lifecycle.signal },
      );
    };
    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, [castVote, memberId, state.itinerary]);

  if (loading) return <LoadingScreen />;
  if (invalidInvite) return <InvalidInvite />;

  const currentMember = state.members.find((member) => member.id === memberId);
  const dates = tripDates(state.trip.startDate, state.trip.endDate);
  const visibleMembers = memberFilter === "all" ? state.members : state.members.filter((m) => m.id === memberFilter);
  const dayItems = itineraryForDay(state.itinerary, selectedDate);
  const detailItinerary = state.itinerary.find((item) => item.id === detailItineraryId);
  const filteredActivities = state.activities.filter(
    (activity) => cityFilter === "全部" || activity.city === cityFilter,
  );
  const draftScheduleConflicts = itineraryDraft ? findScheduleConflicts(state.itinerary, {
    id: itineraryDraft.id ?? "unsaved-activity",
    date: itineraryDraft.date,
    time: itineraryDraft.startTime,
    endTime: itineraryDraft.endTime,
    endDate: itineraryDraft.endDate,
    memberIds: itineraryDraft.memberIds,
  }) : [];

  return (
    <div className="min-h-dvh bg-[#f7f8fb] text-[#172033]">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/92 backdrop-blur-xl">
        <div className="mx-auto flex h-[70px] max-w-[1480px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          <div className="brand-mark"><Route size={20} strokeWidth={2.2} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[17px] font-bold tracking-[-0.02em]">Trip Together</h1>
              {saving && <span className="text-xs text-slate-400">同步中…</span>}
            </div>
            <p className="truncate text-xs text-slate-500">{state.trip.name} · {state.trip.destination}</p>
          </div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-1.5 pr-3 shadow-sm transition hover:border-slate-300"
            onClick={() => {
              setNameDraft(currentMember?.name ?? "");
              setIdentityOpen(true);
            }}
          >
            <span className="grid size-8 place-items-center rounded-full text-sm font-bold text-white" style={{ background: currentMember?.color ?? "#8993a5" }}>
              {currentMember ? memberInitial(currentMember.name) : <Users size={15} />}
            </span>
            <span className="hidden text-sm font-semibold sm:block">{currentMember?.name ?? "選擇身份"}</span>
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1480px]">
        <aside className="sticky top-[70px] hidden h-[calc(100dvh-70px)] w-[232px] shrink-0 border-r border-slate-200 bg-white px-4 py-6 lg:block">
          <nav className="space-y-1.5" aria-label="主要功能">
            <SideButton active={section === "schedule"} icon={<CalendarDays />} onClick={() => setSection("schedule")}>每日行程</SideButton>
            <SideButton active={section === "activities"} icon={<Compass />} onClick={() => setSection("activities")}>活動籃子</SideButton>
            <SideButton active={section === "votes"} icon={<Vote />} onClick={() => setSection("votes")} count={state.proposals.filter((p) => p.status === "voting").length}>投票與邀請</SideButton>
          </nav>
          <div className="mt-8 rounded-2xl bg-[#172033] p-4 text-white">
            <p className="text-xs font-semibold text-white/60">下一個共同活動</p>
            <p className="mt-2 text-sm font-bold">悉尼歌劇院與海港</p>
            <p className="mt-1 text-xs text-white/65">1月3日 · 10:00</p>
            <div className="mt-4 flex -space-x-2">
              {state.members.slice(0, 5).map((member) => <MemberDot key={member.id} member={member} />)}
              {state.members.length > 5 && <span className="grid size-7 place-items-center rounded-full border-2 border-[#172033] bg-white text-[10px] font-bold text-[#172033]">+{state.members.length - 5}</span>}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7">
          {section === "schedule" && (
            <ScheduleView
              dates={dates}
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              state={state}
              visibleMembers={visibleMembers}
              dayItems={dayItems}
              memberFilter={memberFilter}
              onMemberFilter={setMemberFilter}
              activities={state.activities}
              basketOpen={basketOpen}
              onBasketOpen={setBasketOpen}
              onNewItinerary={() => openNewItinerary()}
              onNewMember={openNewMember}
              onScheduleActivity={openNewItinerary}
              canManageActivity={canManageActivity}
              onEditActivity={openEditActivity}
              onDeleteActivity={requestDeleteActivity}
              onEditItinerary={openEditItinerary}
              onViewItinerary={(item) => setDetailItineraryId(item.id)}
              onDeleteItinerary={requestDeleteItinerary}
              canManageItem={canManageItem}
            />
          )}
          {section === "activities" && (
            <ActivitiesView
              activities={filteredActivities}
              cityFilter={cityFilter}
              onCityFilter={setCityFilter}
              inviteToken={inviteToken}
              onNew={openNewActivity}
              onSelect={openActivityDetails}
              onScheduleActivity={openNewItinerary}
              canManageActivity={canManageActivity}
              onEdit={openEditActivity}
              onDelete={requestDeleteActivity}
            />
          )}
          {section === "votes" && (
            <VotesView
              state={state}
              memberId={memberId}
              onVote={requestVote}
              onPublish={publishProposal}
            />
          )}
        </main>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-3 rounded-[22px] border border-slate-200 bg-white/95 p-1.5 shadow-[0_16px_44px_rgba(23,32,51,0.16)] backdrop-blur-xl lg:hidden" aria-label="主要功能">
        <BottomButton active={section === "schedule"} icon={<Home />} onClick={() => setSection("schedule")}>行程</BottomButton>
        <BottomButton active={section === "activities"} icon={<Compass />} onClick={() => setSection("activities")}>活動</BottomButton>
        <BottomButton active={section === "votes"} icon={<Vote />} onClick={() => setSection("votes")}>投票</BottomButton>
      </nav>

      <Dialog open={identityOpen} onOpenChange={(open) => memberId && setIdentityOpen(open)}>
        <DialogContent showCloseButton={Boolean(memberId)} className="max-h-[92dvh] max-w-md overflow-y-auto rounded-3xl p-0">
          <div className="identity-hero p-6 text-white">
            <div className="mb-8 flex items-center justify-between">
              <div className="brand-mark brand-mark-light"><Route size={20} /></div>
              <Badge className="border-white/15 bg-white/10 text-white">私人旅程</Badge>
            </div>
            <DialogHeader className="text-left">
              <DialogTitle className="text-2xl font-bold tracking-tight text-white">你是哪位團友？</DialogTitle>
              <DialogDescription className="text-white/70">選擇姓名後便可查看及管理自己的行程。</DialogDescription>
            </DialogHeader>
          </div>
          <div className="grid grid-cols-2 gap-3 p-5">
            {state.members.map((member) => (
              <button key={member.id} type="button" onClick={() => selectIdentity(member.id)} className="member-choice">
                <span className="grid size-10 place-items-center rounded-full font-bold text-white" style={{ background: member.color }}>{memberInitial(member.name)}</span>
                <span className="min-w-0 text-left">
                  <span className="block truncate text-sm font-bold">{member.name}</span>
                  <span className="block text-xs text-slate-500">{member.label}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="px-5 pb-5"><Button variant="outline" className="h-11 w-full rounded-xl" onClick={openNewMember}><UserPlus /> 新增團友</Button></div>
          {memberId && currentMember && (
            <div className="border-t border-slate-100 px-5 pb-5 pt-4">
              <p className="mb-2 text-sm font-bold">修改我的名字</p>
              <div className="flex gap-2">
                <input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} maxLength={24} className="editor-input min-w-0 flex-1" aria-label="我的顯示名字" />
                <Button onClick={saveMemberName} className="h-11 rounded-xl bg-[#172033] px-4 text-white hover:bg-[#26334d]">儲存</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={newMemberOpen} onOpenChange={(open) => { if (!open) closeNewMember(); }}>
        <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto rounded-3xl">
          <DialogHeader><DialogTitle>新增團友</DialogTitle><DialogDescription>輸入姓名，便可加入這個旅程的團友名單。之後可選擇身份、勾選同行或發起邀請。</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); saveNewMember(); }}>
            <EditorField label="團友姓名" required><input autoFocus required maxLength={24} disabled={saving} value={newMemberName} onChange={(event) => setNewMemberName(event.target.value)} className="editor-input" placeholder="輸入姓名或稱呼" /></EditorField>
            <p className="text-xs leading-5 text-slate-500">現有活動的同行名單會保留，可另外為新團友安排行程。</p>
            <div className="flex gap-2"><Button type="button" variant="outline" disabled={saving} className="h-11 rounded-xl" onClick={closeNewMember}>取消</Button><Button type="submit" disabled={saving || !newMemberName.trim()} className="h-11 flex-1 rounded-xl bg-[#172033] text-white hover:bg-[#26334d]"><UserPlus />{saving ? "正在新增…" : "新增團友"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Drawer open={Boolean(selectedActivity)} onOpenChange={(open) => !open && setSelectedActivity(null)}>
        <DrawerContent className="mx-auto max-h-[92dvh] max-w-2xl overflow-hidden rounded-t-[28px]">
          {selectedActivity && (
            <div className="overflow-y-auto">
              <div className="relative h-56 overflow-hidden">
                <ActivityPhoto activity={selectedActivity} className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#101827]/80 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-5 right-5 text-white">
                  <p className="text-xs font-semibold text-white/75">{selectedActivity.city} · {selectedActivity.category}</p>
                  <h2 className="mt-1 text-2xl font-bold">{selectedActivity.title}</h2>
                </div>
              </div>
              <DrawerHeader className="px-5 pb-2 text-left">
                <DrawerTitle className="sr-only">{selectedActivity.title}</DrawerTitle>
                <DrawerDescription className="text-base leading-7 text-slate-600">{selectedActivity.description}</DrawerDescription>
              </DrawerHeader>
              <div className="grid gap-3 px-5 py-3 sm:grid-cols-2">
                <InfoRow icon={<Clock3 />} label="營業資料" value={selectedActivity.hours} />
                <InfoRow icon={<Navigation />} label="交通" value={selectedActivity.travel} />
                <InfoRow icon={<Route />} label="步行程度" value={selectedActivity.walking} />
                <InfoRow icon={<MapPin />} label="地區" value={selectedActivity.area} />
              </div>
              <div className="mx-5 my-4 rounded-2xl border border-slate-200 p-4">
                <p className="mb-3 text-sm font-bold">建議活動時間</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <EditorField label="開始日期"><input type="date" min={state.trip.startDate} max={state.trip.endDate} value={proposalDate} onChange={(event) => { setProposalEndDate(shiftEndDate(proposalDate, event.target.value, proposalEndDate)); setProposalDate(event.target.value); }} className="editor-input" /></EditorField>
                  <EditorField label="開始"><input type="time" value={proposalStart} onChange={(event) => { setProposalStart(event.target.value); if (proposalEndDate === proposalDate) setProposalEndDate(""); }} className="editor-input" /></EditorField>
                  <EditorField label="結束日期"><input type="date" min={proposalDate} max={state.trip.endDate} value={effectiveEndDate({ date: proposalDate, time: proposalStart, endTime: proposalEnd, endDate: proposalEndDate })} onChange={(event) => setProposalEndDate(event.target.value)} className="editor-input" /></EditorField>
                  <EditorField label="結束"><input type="time" value={proposalEnd} onChange={(event) => { setProposalEnd(event.target.value); if (proposalEndDate === proposalDate) setProposalEndDate(""); }} className="editor-input" /></EditorField>
                </div>
                <p className="mt-2 text-xs text-slate-500">結束時間早於或等於開始時間時，預設翌日結束；也可自選結束日期。</p>
              </div>
              <div className="mx-5 my-4 rounded-2xl border border-slate-200 p-4">
                <p className="mb-1 text-sm font-bold">選擇哪些團友？</p>
                <p className="mb-3 text-xs text-slate-500">直接加入會列為同行成員；發起投票則邀請以下團友。</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {state.members.map((member) => (
                    <label key={member.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={inviteSelection.includes(member.id)}
                        onCheckedChange={(checked) => setInviteSelection((current) => checked ? [...new Set([...current, member.id])] : current.filter((id) => id !== member.id))}
                      />
                      {member.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-3 border-t border-slate-200 bg-white p-5">
                {selectedActivity.sourceUrl && <Button variant="outline" className="h-12 rounded-xl" asChild><a href={selectedActivity.sourceUrl} target="_blank" rel="noreferrer">資料連結 <ExternalLink /></a></Button>}
                {canManageActivity(selectedActivity) && <Button variant="outline" className="h-12 rounded-xl" onClick={() => { const activity = selectedActivity; setSelectedActivity(null); openEditActivity(activity); }}><Pencil /> 修改</Button>}
                <Button className="h-12 min-w-[140px] flex-1 rounded-xl bg-[#172033] text-white hover:bg-[#26334d]" onClick={() => { const activity = { ...selectedActivity, proposedDate: proposalDate, proposedEndDate: effectiveEndDate({ date: proposalDate, time: proposalStart, endTime: proposalEnd, endDate: proposalEndDate }), startTime: proposalStart, endTime: proposalEnd }; setSelectedActivity(null); openNewItinerary(activity, undefined, inviteSelection); }}><Plus /> 加入行程</Button>
                <Button variant="outline" className="h-12 min-w-[140px] flex-1 rounded-xl" onClick={() => startProposal(selectedActivity)}>
                  發起投票 <Vote />
                </Button>
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>
      <Dialog open={Boolean(activityDraft)} onOpenChange={(open) => { if (!open) { setActivityDraft(null); resetActivityPhoto(); } }}>
        <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto rounded-3xl">
          {activityDraft && <>
            <DialogHeader>
              <DialogTitle>{activityDraft.id ? "修改活動籃子項目" : "新增活動到活動籃子"}</DialogTitle>
              <DialogDescription>建立者、團長及其後受邀的團友都可以修改或刪除。</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <EditorField label="活動名稱" required><input value={activityDraft.title} onChange={(event) => setActivityDraft({ ...activityDraft, title: event.target.value })} placeholder="例如：海港遊船" className="editor-input" autoFocus /></EditorField>
              <div className="grid gap-3 sm:grid-cols-3">
                <EditorField label="城市"><select value={activityDraft.city} onChange={(event) => setActivityDraft({ ...activityDraft, city: event.target.value as Activity["city"] })} className="editor-input"><option>悉尼</option><option>墨爾本</option></select></EditorField>
                <EditorField label="分類"><input value={activityDraft.category} onChange={(event) => setActivityDraft({ ...activityDraft, category: event.target.value })} placeholder="美食、景點…" className="editor-input" /></EditorField>
                <EditorField label="地區"><input value={activityDraft.area} onChange={(event) => setActivityDraft({ ...activityDraft, area: event.target.value })} placeholder="地點或地區" className="editor-input" /></EditorField>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <EditorField label="開始日期" required><input type="date" min={state.trip.startDate} max={state.trip.endDate} value={activityDraft.proposedDate} onChange={(event) => setActivityDraft({ ...activityDraft, proposedDate: event.target.value, proposedEndDate: shiftEndDate(activityDraft.proposedDate, event.target.value, activityDraft.proposedEndDate) })} className="editor-input" /></EditorField>
                <EditorField label="開始時間" required><input type="time" value={activityDraft.startTime} onChange={(event) => setActivityDraft({ ...activityDraft, startTime: event.target.value, proposedEndDate: activityDraft.proposedEndDate === activityDraft.proposedDate ? "" : activityDraft.proposedEndDate })} className="editor-input" /></EditorField>
                <EditorField label="結束日期" required><input type="date" min={activityDraft.proposedDate} max={state.trip.endDate} value={effectiveEndDate({ date: activityDraft.proposedDate, time: activityDraft.startTime, endTime: activityDraft.endTime, endDate: activityDraft.proposedEndDate })} onChange={(event) => setActivityDraft({ ...activityDraft, proposedEndDate: event.target.value })} className="editor-input" /></EditorField>
                <EditorField label="結束時間" required><input type="time" value={activityDraft.endTime} onChange={(event) => setActivityDraft({ ...activityDraft, endTime: event.target.value, proposedEndDate: activityDraft.proposedEndDate === activityDraft.proposedDate ? "" : activityDraft.proposedEndDate })} className="editor-input" /></EditorField>
              </div>
              <p className="text-xs text-slate-500">凌晨結束會自動預設為翌日，也可選擇結束日期。</p>
              <EditorField label="相片上載">
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3">
                  {activityPhotoPreview ? <div className="relative overflow-hidden rounded-xl"><img src={activityPhotoPreview} alt="活動相片預覽" className="h-44 w-full object-cover" /><button type="button" onClick={() => { resetActivityPhoto(); setActivityDraft({ ...activityDraft, image: "" }); }} className="absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-white/90 text-slate-700 shadow"><X size={16} /></button></div> : <div className="grid h-32 place-items-center text-center text-slate-400"><div><ImagePlus className="mx-auto" /><p className="mt-2 text-sm font-semibold">JPG、PNG 或 WebP，最多 5 MB</p></div></div>}
                  <label className="mt-3 flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-white text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100"><ImagePlus size={16} />{activityPhotoPreview ? "更換相片" : "選擇相片"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => chooseActivityPhoto(event.target.files?.[0])} /></label>
                </div>
              </EditorField>
              <EditorField label="描述"><textarea value={activityDraft.description} onChange={(event) => setActivityDraft({ ...activityDraft, description: event.target.value })} placeholder="活動內容、特色或注意事項" rows={3} className="editor-input min-h-24 resize-y py-3" /></EditorField>
              <div className="grid gap-3 sm:grid-cols-2">
                <EditorField label="營業／時間資料"><input value={activityDraft.hours} onChange={(event) => setActivityDraft({ ...activityDraft, hours: event.target.value })} placeholder="例如：10:00–18:00" className="editor-input" /></EditorField>
                <EditorField label="交通"><input value={activityDraft.travel} onChange={(event) => setActivityDraft({ ...activityDraft, travel: event.target.value })} placeholder="例如：渡輪約 20 分鐘" className="editor-input" /></EditorField>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <EditorField label="步行程度"><select value={activityDraft.walking} onChange={(event) => setActivityDraft({ ...activityDraft, walking: event.target.value as Activity["walking"] })} className="editor-input"><option>輕鬆</option><option>適中</option></select></EditorField>
                <EditorField label="資料連結"><div className="relative"><Link2 className="absolute left-3 top-3.5 text-slate-400" size={16} /><input type="url" value={activityDraft.sourceUrl} onChange={(event) => setActivityDraft({ ...activityDraft, sourceUrl: event.target.value })} placeholder="https://…" className="editor-input pl-10" /></div></EditorField>
              </div>
              <Button disabled={uploadingPhoto} className="h-12 w-full rounded-xl bg-[#172033] text-white hover:bg-[#26334d]" onClick={() => void saveActivity()}><Check />{uploadingPhoto ? "正在上載相片…" : activityDraft.id ? "儲存修改" : "加入活動籃子"}</Button>
            </div>
          </>}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(detailItinerary)} onOpenChange={(open) => !open && setDetailItineraryId(null)}>
        <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto rounded-3xl">
          {detailItinerary && <>
            <DialogHeader>
              <DialogTitle>活動詳情</DialogTitle>
              <DialogDescription>唯讀查看活動資料。{canManageItem(detailItinerary) ? "如需更改，請按「修改活動」。" : "團長及同行成員可修改此活動。"}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <ReadOnlyField label="活動名稱" value={detailItinerary.title} />
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <ReadOnlyField label="開始日期" value={detailItinerary.date} />
                <ReadOnlyField label="開始時間" value={detailItinerary.time} />
                <ReadOnlyField label="結束日期" value={effectiveEndDate(detailItinerary)} />
                <ReadOnlyField label="結束時間" value={detailItinerary.endTime} />
              </div>
              <ReadOnlyField label="地點" value={detailItinerary.place} />
              <ReadOnlyField label="交通" value={detailItinerary.transport} />
              <div className="space-y-2"><p className="text-sm font-bold text-slate-700">同行成員</p><div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3">{detailItinerary.memberIds.length ? state.members.filter((member) => detailItinerary.memberIds.includes(member.id)).map((member) => <span key={member.id} className="inline-flex items-center gap-2 break-words text-sm font-semibold"><span className="size-3 shrink-0 rounded-full" style={{ background: member.color }} />{member.name}</span>) : <span className="text-sm text-slate-500">待選</span>}</div></div>
              <ReadOnlyField label="描述" value={detailItinerary.description} />
              <ReadOnlyField label="聯絡資料" value={detailItinerary.contact} />
              <ReadOnlyField label="活動狀態" value={statusLabel(detailItinerary.status)} />
              <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                <Button variant="outline" className="h-11 rounded-xl" onClick={() => setDetailItineraryId(null)}>關閉</Button>
                {canManageItem(detailItinerary) && <>
                  <Button className="h-11 flex-1 rounded-xl bg-[#172033] text-white hover:bg-[#26334d]" onClick={() => { setDetailItineraryId(null); openEditItinerary(detailItinerary); }}><Pencil /> 修改活動</Button>
                  <Button variant="outline" className="h-11 rounded-xl text-red-600" onClick={() => { setDetailItineraryId(null); requestDeleteItinerary(detailItinerary); }}><Trash2 /> 刪除</Button>
                </>}
              </div>
            </div>
          </>}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(itineraryDraft)} onOpenChange={(open) => !open && setItineraryDraft(null)}>
        <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto rounded-3xl">
          {itineraryDraft && <>
            <DialogHeader>
              <DialogTitle>{itineraryDraft.id ? "修改活動" : "新增活動"}</DialogTitle>
              <DialogDescription>
                團長及已剔選的團友可修改或刪除；可更改日期或移回活動籃子。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <EditorField label="活動名稱" required>
                <input value={itineraryDraft.title} onChange={(event) => setItineraryDraft({ ...itineraryDraft, title: event.target.value })} placeholder="例如：海港晚餐" className="editor-input" autoFocus />
              </EditorField>
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                <EditorField label="開始日期" required><input type="date" min={state.trip.startDate} max={state.trip.endDate} value={itineraryDraft.date} onChange={(event) => setItineraryDraft({ ...itineraryDraft, date: event.target.value, endDate: shiftEndDate(itineraryDraft.date, event.target.value, itineraryDraft.endDate) })} className="editor-input" /></EditorField>
                <EditorField label="開始時間" required><input type="time" min="00:00" max="23:59" step="60" value={itineraryDraft.startTime} onChange={(event) => setItineraryDraft({ ...itineraryDraft, startTime: event.target.value, endDate: itineraryDraft.endDate === itineraryDraft.date ? "" : itineraryDraft.endDate })} className="editor-input" /></EditorField>
                <EditorField label="結束日期" required><input type="date" min={itineraryDraft.date} max={state.trip.endDate} value={effectiveEndDate({ date: itineraryDraft.date, time: itineraryDraft.startTime, endTime: itineraryDraft.endTime, endDate: itineraryDraft.endDate })} onChange={(event) => setItineraryDraft({ ...itineraryDraft, endDate: event.target.value })} className="editor-input" /></EditorField>
                <EditorField label="結束時間" required><input type="time" min="00:00" max="23:59" step="60" value={itineraryDraft.endTime} onChange={(event) => setItineraryDraft({ ...itineraryDraft, endTime: event.target.value, endDate: itineraryDraft.endDate === itineraryDraft.date ? "" : itineraryDraft.endDate })} className="editor-input" /></EditorField>
              </div>
              <p className="text-xs leading-5 text-slate-500">結束時間早於或等於開始時間時，預設翌日結束。跨日活動會自動顯示在相關日期，修改及刪除會一併生效。</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <EditorField label="地點"><input value={itineraryDraft.place} onChange={(event) => setItineraryDraft({ ...itineraryDraft, place: event.target.value })} placeholder="集合或活動地點" className="editor-input" /></EditorField>
                <EditorField label="交通"><input value={itineraryDraft.transport} onChange={(event) => setItineraryDraft({ ...itineraryDraft, transport: event.target.value })} placeholder="例如：的士約 15 分鐘" className="editor-input" /></EditorField>
              </div>
              <EditorField label="描述"><textarea value={itineraryDraft.description} onChange={(event) => setItineraryDraft({ ...itineraryDraft, description: event.target.value })} placeholder="活動內容、集合方式或備註" rows={3} className="editor-input min-h-24 resize-y py-3" /></EditorField>
              <EditorField label="聯絡資料"><input value={itineraryDraft.contact} onChange={(event) => setItineraryDraft({ ...itineraryDraft, contact: event.target.value })} placeholder="電話、訂位名稱或聯絡方式" className="editor-input" /></EditorField>
              <fieldset className="rounded-2xl border border-slate-200 p-4">
                <legend className="px-1 text-sm font-bold">同行成員</legend>
                <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {state.members.map((member) => <label key={member.id} className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                    <Checkbox checked={itineraryDraft.memberIds.includes(member.id)} onCheckedChange={(checked) => setItineraryDraft({ ...itineraryDraft, memberIds: checked ? [...new Set([...itineraryDraft.memberIds, member.id])] : itineraryDraft.memberIds.filter((id) => id !== member.id) })} />
                    <span className="size-2 rounded-full" style={{ background: member.color }} />{member.name}
                  </label>)}
                </div>
              </fieldset>
              {draftScheduleConflicts.length > 0 && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-bold">同行成員已有活動，請先改日期、時間或同行者。</p><ScheduleConflictList conflicts={draftScheduleConflicts} members={state.members} /></div>}
              <Button disabled={saving} className="h-12 w-full rounded-xl bg-[#172033] text-white hover:bg-[#26334d]" onClick={saveItinerary}><Check /> {itineraryDraft.id ? "儲存修改" : "加入行程"}</Button>
              {itineraryDraft.id && <Button variant="outline" className="h-12 w-full rounded-xl" onClick={requestReturnToBasket}><Compass /> 移回活動籃子</Button>}
            </div>
          </>}
        </DialogContent>
      </Dialog>
      <AlertDialog open={scheduleConflicts.length > 0} onOpenChange={(open) => !open && setScheduleConflicts([])}>
        <AlertDialogContent className="max-h-[85dvh] overflow-y-auto rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>同行成員的時間撞期，未能儲存</AlertDialogTitle>
            <AlertDialogDescription>同一團友不可同時參與多個活動。請調整日期、時間或同行者，或先把原活動移回活動籃子。</AlertDialogDescription>
          </AlertDialogHeader>
          <ScheduleConflictList conflicts={scheduleConflicts} members={state.members} />
          <AlertDialogFooter><AlertDialogCancel className="rounded-xl">返回調整</AlertDialogCancel></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={returnToBasketOpen} onOpenChange={setReturnToBasketOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>把「{itineraryDraft?.title}」移回活動籃子？</AlertDialogTitle>
            <AlertDialogDescription>會保留目前修改的內容、日期、時間、聯絡資料及原同行者名單，並從所有相關團友的每日行程移除。若此卡由投票發布，該次邀請及結果亦會撤回，可之後重新邀請。</AlertDialogDescription>
          </AlertDialogHeader>
          <EditorField label="所屬城市"><select className="editor-input" value={returnBasketCity} onChange={(event) => setReturnBasketCity(event.target.value as Activity["city"])}><option>悉尼</option><option>墨爾本</option></select></EditorField>
          <AlertDialogFooter><AlertDialogCancel className="rounded-xl">取消</AlertDialogCancel><AlertDialogAction className="rounded-xl bg-[#172033] text-white" onClick={returnToBasket}>確認移回</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader><AlertDialogTitle>刪除「{deleteTarget?.title}」？</AlertDialogTitle><AlertDialogDescription>活動將從所有相關團友及日期的時間軸移除，跨日部分也會一併刪除，此操作無法復原。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel className="rounded-xl">取消</AlertDialogCancel><AlertDialogAction className="rounded-xl bg-red-600 text-white hover:bg-red-700" onClick={deleteItinerary}>刪除活動</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(activityDeleteTarget)} onOpenChange={(open) => !open && setActivityDeleteTarget(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader><AlertDialogTitle>刪除「{activityDeleteTarget?.title}」？</AlertDialogTitle><AlertDialogDescription>活動會從活動籃子移除，尚未發布的邀請及投票亦會刪除；已發布的每日行程不會自動移除。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel className="rounded-xl">取消</AlertDialogCancel><AlertDialogAction className="rounded-xl bg-red-600 text-white hover:bg-red-700" onClick={deleteActivity}>刪除活動</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(pendingConflictVote)} onOpenChange={(open) => !open && setPendingConflictVote(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>這個時間與你的行程撞期</AlertDialogTitle>
            <AlertDialogDescription asChild><div>你已有：<ul className="mt-3 space-y-2">{pendingConflictVote?.conflicts.map((item) => <li key={item.id} className="rounded-xl bg-amber-50 p-3 font-semibold text-amber-900">{scheduleRangeLabel(item)} · {item.title}</li>)}</ul></div></AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel className="rounded-xl">暫不參加</AlertDialogCancel><AlertDialogAction className="rounded-xl bg-[#ef6a54] text-white hover:bg-[#db5946]" onClick={() => { if (pendingConflictVote) castVote(pendingConflictVote.activityId, "yes"); setPendingConflictVote(null); }}>仍然參加</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster position="top-center" richColors />
    </div>
  );
}

function ScheduleView({ dates, selectedDate, onDateChange, state, visibleMembers, dayItems, memberFilter, onMemberFilter, activities, basketOpen, onBasketOpen, onNewItinerary, onNewMember, onScheduleActivity, canManageActivity, onEditActivity, onDeleteActivity, onEditItinerary, onViewItinerary, onDeleteItinerary, canManageItem }: {
  dates: Date[];
  selectedDate: string;
  onDateChange: (value: string) => void;
  state: TripState;
  visibleMembers: TripState["members"];
  dayItems: ItineraryItem[];
  memberFilter: string;
  onMemberFilter: (value: string) => void;
  activities: Activity[];
  basketOpen: boolean;
  onBasketOpen: (value: boolean) => void;
  onNewItinerary: () => void;
  onNewMember: () => void;
  onScheduleActivity: (activity: Activity, startTime?: string) => void;
  canManageActivity: (activity: Activity) => boolean;
  onEditActivity: (activity: Activity) => void;
  onDeleteActivity: (activity: Activity) => void;
  onEditItinerary: (item: ItineraryItem) => void;
  onViewItinerary: (item: ItineraryItem) => void;
  onDeleteItinerary: (item: ItineraryItem) => void;
  canManageItem: (item: ItineraryItem) => boolean;
}) {
  const dateStripRef = useRef<HTMLDivElement>(null);
  const activeDateRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const strip = dateStripRef.current;
    const active = activeDateRef.current;
    if (!strip || !active) return;
    const offset = active.getBoundingClientRect().left - strip.getBoundingClientRect().left;
    strip.scrollTo({ left: Math.max(0, strip.scrollLeft + offset - 8) });
  }, [selectedDate]);
  const today = tripLocalDate(state.trip);
  const visibleIds = new Set(visibleMembers.map((member) => member.id));
  const visibleItems = dayItems
    .filter((item) => item.memberIds.some((id) => visibleIds.has(id)))
    .sort((a, b) => a.time.localeCompare(b.time));
  const startHour = Math.min(6, ...visibleItems.map((item) => Math.floor(timeToMinutes(item.time) / 60)));
  const timelineStart = startHour * 60;
  const positionedItems = layoutTimelineItems(visibleItems, timelineStart);
  const existingConflicts = dayItems.flatMap((item) => findScheduleConflicts(dayItems, item).filter((conflict) => item.id < conflict.item.id).map((conflict) => ({ ...conflict, otherTitle: item.title })));
  const hours = Array.from({ length: 25 - startHour }, (_, index) => index + startHour);
  const canvasHeight = ((TIMELINE_END - timelineStart) / 60) * HOUR_HEIGHT;

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const activity = activities.find((item) => item.id === event.dataTransfer.getData("text/activity-id"));
    if (!activity) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const minutesFromStart = Math.round((((event.clientY - rect.top) / HOUR_HEIGHT) * 60) / 15) * 15;
    const start = Math.max(timelineStart, Math.min(timelineStart + minutesFromStart, 23 * 60 + 30));
    onScheduleActivity(activity, minutesToTime(start));
  };
  return (
    <section>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="eyebrow">每日行程</p>
          <div className="flex flex-wrap items-center gap-3"><h2 className="page-title">大家今日去邊度？</h2><Button variant="outline" size="sm" className="shrink-0 rounded-full bg-white" onClick={onNewMember}><UserPlus /> 新增團友</Button></div>
          <p className="mt-1 text-sm text-slate-500">一眼看清同行、分組與集合安排</p>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button className={`member-filter ${memberFilter === "all" ? "active" : ""}`} onClick={() => onMemberFilter("all")}><Users size={15} /> 全部</button>
          {state.members.map((member) => (
            <button key={member.id} className={`member-filter ${memberFilter === member.id ? "active" : ""}`} onClick={() => onMemberFilter(member.id)}>
              <span className="size-2 rounded-full" style={{ background: member.color }} />{member.name}
            </button>
          ))}
        </div>
      </div>

      <div ref={dateStripRef} className="date-strip mt-6">
        {dates.map((date) => {
          const iso = date.toISOString().slice(0, 10);
          const active = iso === selectedDate;
          return (
            <button ref={active ? activeDateRef : undefined} key={iso} type="button" className={`date-pill ${active ? "active" : ""}`} aria-current={iso === today ? "date" : undefined} aria-pressed={active} onClick={() => onDateChange(iso)}>
              <span>{weekdayFormatter.format(date)}</span>
              <strong>{dateFormatter.format(date).replace("月", "/").replace("日", "")}</strong>
              {iso === today && <i />}
            </button>
          );
        })}
      </div>

      <div className={`schedule-workspace mt-5 ${basketOpen ? "basket-visible" : ""}`}>
      <div className="min-w-0 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_12px_40px_rgba(23,32,51,0.06)]">
        <div className="flex items-center justify-between border-b border-slate-100 bg-[#fbfcfe] px-5 py-4">
          <div>
            <p className="text-sm font-bold">{new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString("zh-HK", { month: "long", day: "numeric", weekday: "long", timeZone: "UTC" })}</p>
            <p className="mt-0.5 text-xs text-slate-500">澳洲東部時間 · {dayItems.length} 項安排</p>
          </div>
          <div className="flex items-center gap-2"><Badge variant="outline" className="hidden rounded-full border-slate-200 bg-white text-slate-600 sm:flex"><Sparkles size={13} /> 輕鬆節奏</Badge><Button size="sm" className="rounded-full bg-[#ef6a54] text-white hover:bg-[#db5946]" onClick={onNewItinerary}><Plus /> 新增</Button><Button variant="outline" size="sm" className="rounded-full" onClick={() => onBasketOpen(!basketOpen)}><PanelRightOpen /> 活動籃子</Button></div>
        </div>
        {existingConflicts.length > 0 && <div role="alert" className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-950"><p className="font-bold">這天有團友行程撞期，請修改時間、同行者或移回活動籃子。</p><ul className="mt-2 space-y-1">{existingConflicts.map((conflict, index) => <li key={index}>{conflict.memberIds.map((id) => state.members.find((member) => member.id === id)?.name ?? id).join("、")}：「{conflict.otherTitle}」與「{conflict.item.title}」</li>)}</ul></div>}
        <div className="day-timeline" style={{ height: canvasHeight + 24 }}>
          <div className="timeline-hours" aria-hidden="true">
            {hours.map((hour) => <div key={hour} className="timeline-hour-label" style={{ top: (hour - startHour) * HOUR_HEIGHT }}><time>{`${String(hour).padStart(2, "0")}:00`}</time><span /></div>)}
          </div>
          <div className="timeline-canvas" style={{ height: canvasHeight }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDrop={handleDrop}>
            {positionedItems.map(({ item, top, height, left, width }) => <div key={item.id} className="timeline-position" style={{ top, height, left: `${left}%`, width: `${width}%` }}>
              <TimelineCard item={item} members={state.members.filter((member) => item.memberIds.includes(member.id))} height={height} canManage={canManageItem(item)} onOpen={() => onViewItinerary(state.itinerary.find((original) => original.id === item.id) ?? item)} onEdit={() => onEditItinerary(state.itinerary.find((original) => original.id === item.id) ?? item)} onDelete={() => onDeleteItinerary(state.itinerary.find((original) => original.id === item.id) ?? item)} />
            </div>)}
            {!positionedItems.length && <div className="timeline-empty"><CalendarDays /><p>這天尚未有活動</p><button type="button" onClick={onNewItinerary}>新增第一個活動</button></div>}
            <span className="timeline-drop-label">拖放活動到指定時間</span>
          </div>
        </div>
      </div>
      {basketOpen && <ActivityBasketPanel activities={activities} onClose={() => onBasketOpen(false)} onScheduleActivity={onScheduleActivity} canManageActivity={canManageActivity} onEditActivity={onEditActivity} onDeleteActivity={onDeleteActivity} />}
      </div>
    </section>
  );
}

function TimelineCard({ item, members, height, canManage, onOpen, onEdit, onDelete }: { item: ItineraryItem & Partial<Pick<DailyItineraryItem, "continuesFromPreviousDay" | "continuesToNextDay">>; members: TripState["members"]; height: number; canManage: boolean; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  return (
    <article className={`timeline-card tone-${item.tone} ${height < 126 ? "is-short" : ""}`} onClick={(event) => { if (event.target === event.currentTarget) onOpen(); }}>
      <button type="button" className="timeline-card-open" aria-label={`查看活動詳情：${item.title}`} onClick={onOpen}>
        <span className="timeline-card-time text-xs font-bold opacity-65">{item.time}–{item.endTime}{item.continuesFromPreviousDay ? " · 續前日" : item.continuesToNextDay ? " · 續至翌日" : ""}</span>
        <span className="timeline-card-title text-sm font-bold">{item.title}</span>
        {(item.place || item.transport) && <span className="timeline-card-meta text-xs opacity-75">{item.place && <span><MapPin size={12} /><span className="timeline-meta-value">{item.place}</span></span>}{item.transport && <span><Navigation size={12} /><span className="timeline-meta-value">{item.transport}</span></span>}</span>}
        <span className="timeline-card-members" aria-label="同行者">{members.length ? members.map((member) => <span key={member.id} className="timeline-member"><i style={{ background: member.color }} aria-hidden="true" /><span>{member.name}</span></span>) : <span className="text-xs opacity-65">同行者待選</span>}</span>
      </button>
      {canManage && <div className="timeline-card-actions"><button type="button" className="card-action" onClick={onEdit} title="修改活動" aria-label={`修改 ${item.title}`}><Pencil /></button><button type="button" className="card-action card-action-delete" onClick={onDelete} title="刪除活動" aria-label={`刪除 ${item.title}`}><Trash2 /></button></div>}
    </article>
  );
}

function ActivityBasketPanel({ activities, onClose, onScheduleActivity, canManageActivity, onEditActivity, onDeleteActivity }: { activities: Activity[]; onClose: () => void; onScheduleActivity: (activity: Activity) => void; canManageActivity: (activity: Activity) => boolean; onEditActivity: (activity: Activity) => void; onDeleteActivity: (activity: Activity) => void }) {
  return <aside className="activity-basket-panel">
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4"><div><p className="text-sm font-bold">活動籃子</p><p className="mt-0.5 text-xs text-slate-500">拖到時間軸，或按「加入」</p></div><button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-100">收起</button></div>
    <div className="space-y-3 overflow-y-auto p-3">
      {activities.map((activity) => <article key={activity.id} draggable onDragStart={(event) => { event.dataTransfer.setData("text/activity-id", activity.id); event.dataTransfer.effectAllowed = "copy"; }} className="basket-activity cursor-grab active:cursor-grabbing">
        <ActivityPhoto activity={activity} className="h-20 w-24 flex-none rounded-xl object-cover" />
        <div className="min-w-0 flex-1"><p className="text-[11px] font-bold text-[#ef6a54]">{activity.city} · {activity.category}</p><h3 className="mt-1 line-clamp-2 text-sm font-bold">{activity.title}</h3><p className="mt-1 text-[11px] text-slate-400">{activityScheduleLabel(activity)}</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => onScheduleActivity(activity)} className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-[#ef6a54]"><Plus size={13} /> 加入行程</button>{canManageActivity(activity) && <><button type="button" onClick={() => onEditActivity(activity)} className="text-xs font-bold text-slate-500 hover:text-[#ef6a54]">修改</button><button type="button" onClick={() => onDeleteActivity(activity)} className="text-xs font-bold text-red-500 hover:text-red-700">刪除</button></>}</div></div>
      </article>)}
    </div>
  </aside>;
}

type LivePlace = { id: string; name: string; address: string; latitude: number; longitude: number; category: string };

function ActivitiesView({ activities, cityFilter, onCityFilter, onSelect, onNew, onScheduleActivity, canManageActivity, onEdit, onDelete, inviteToken }: { activities: Activity[]; cityFilter: string; onCityFilter: (value: string) => void; onSelect: (activity: Activity) => void; onNew: () => void; onScheduleActivity: (activity: Activity) => void; canManageActivity: (activity: Activity) => boolean; onEdit: (activity: Activity) => void; onDelete: (activity: Activity) => void; inviteToken: string }) {
  const [query, setQuery] = useState("");
  const [livePlaces, setLivePlaces] = useState<LivePlace[]>([]);
  const [searching, setSearching] = useState(false);

  const searchPlaces = async () => {
    if (query.trim().length < 2) {
      toast.error("請輸入至少兩個字");
      return;
    }
    setSearching(true);
    try {
      const params = new URLSearchParams({ query: query.trim(), city: cityFilter });
      const response = await fetch(`/api/places?${params}`, { headers: { "x-trip-invite": inviteToken } });
      const data = await response.json() as { error?: string; places?: LivePlace[] };
      if (!response.ok) throw new Error(data.error ?? "暫時未能搜尋地點");
      setLivePlaces(data.places ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "暫時未能搜尋地點");
    } finally {
      setSearching(false);
    }
  };

  return (
    <section>
      <p className="eyebrow">活動籃子</p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="page-title">下一站想去邊？</h2><p className="mt-1 text-sm text-slate-500">直接加入行程，或邀請團友一起投票</p></div>
        <div className="flex flex-wrap gap-2"><Button onClick={onNew} className="rounded-full bg-[#ef6a54] text-white hover:bg-[#db5946]"><Plus /> 新增活動</Button>{["全部", "悉尼", "墨爾本"].map((city) => <button key={city} className={`filter-chip ${cityFilter === city ? "active" : ""}`} onClick={() => onCityFilter(city)}>{city}</button>)}</div>
      </div>
      <div className="mt-5 rounded-[22px] border border-slate-200 bg-white p-3 shadow-[0_10px_30px_rgba(23,32,51,.04)]">
        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-slate-50 px-4">
            <Search size={17} className="text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void searchPlaces()}
              placeholder="搜尋景點、市場或餐廳"
              className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
              aria-label="搜尋免費旅遊地點"
            />
          </label>
          <Button onClick={() => void searchPlaces()} disabled={searching} className="h-12 rounded-2xl bg-[#172033] px-5 text-white hover:bg-[#26334d]">
            {searching ? "搜尋中…" : "搜尋"}
          </Button>
        </div>
        <p className="mt-2 px-1 text-[11px] text-slate-400">按下搜尋才會查詢；地點資料由 OpenStreetMap 提供。</p>
      </div>
      {livePlaces.length > 0 && (
        <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold">即時搜尋結果</h3><span className="text-[10px] text-slate-400">© OpenStreetMap contributors</span></div>
          <div className="grid gap-2 md:grid-cols-2">
            {livePlaces.map((place) => (
              <a key={place.id} href={`https://www.google.com/maps/search/?api=1&query=${place.latitude}%2C${place.longitude}`} target="_blank" rel="noreferrer" className="flex items-start gap-3 rounded-2xl border border-slate-100 p-3 transition hover:border-[#ef6a54] hover:bg-[#fff8f6]">
                <span className="grid size-9 flex-none place-items-center rounded-xl bg-[#fff0ec] text-[#ef6a54]"><MapPin size={16} /></span>
                <span className="min-w-0"><span className="block truncate text-sm font-bold">{place.name}</span><span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-slate-500">{place.address}</span></span>
                <ExternalLink size={14} className="ml-auto mt-1 flex-none text-slate-300" />
              </a>
            ))}
          </div>
        </div>
      )}
      <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {activities.map((activity) => (
          <article key={activity.id} className="activity-card">
            <button type="button" className="block w-full text-left" onClick={() => onSelect(activity)}>
              <div className="relative h-52 overflow-hidden">
                <ActivityPhoto activity={activity} className="h-full w-full object-cover transition duration-500 hover:scale-[1.03]" />
                <span className="absolute left-3 top-3 rounded-full bg-white/92 px-3 py-1.5 text-xs font-bold text-[#172033] shadow-sm backdrop-blur">{activity.category}</span>
                <span className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-white/92 text-[#ef6a54] shadow-sm"><Heart size={17} /></span>
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[#ef6a54]">{activity.city} · {activity.area}</p><h3 className="mt-1 text-lg font-bold tracking-tight">{activity.title}</h3></div><ChevronRight className="mt-2 text-slate-300" size={20} /></div>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-500">{activity.description}</p>
                {activity.proposedDate && <p className="mt-3 text-xs font-bold text-slate-600"><CalendarDays className="mr-1 inline" size={13} />{activityScheduleLabel(activity)}</p>}
                <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4 text-xs font-semibold text-slate-500"><span className="flex items-center gap-1"><Route size={13} /> {activity.walking}</span><span className="flex items-center gap-1"><Clock3 size={13} /> 即時覆核</span></div>
              </div>
            </button>
            <div className="px-5 pb-3"><Button className="h-11 w-full rounded-xl bg-[#172033] text-white hover:bg-[#26334d]" onClick={() => onScheduleActivity(activity)}><Plus /> 加入行程</Button></div>
            <div className="activity-card-footer flex items-center justify-between gap-2 px-5 pb-4">
              {activity.imageSourceUrl ? <a className="image-credit static" href={activity.imageSourceUrl} target="_blank" rel="noreferrer">相片：{activity.imageCredit}</a> : <span className="text-[10px] text-slate-400">{activity.image ? "相片：團友上載" : "未有相片"}</span>}
              {canManageActivity(activity) && <div className="flex gap-1"><button type="button" className="card-action" onClick={() => onEdit(activity)} aria-label={`修改 ${activity.title}`}><Pencil /></button><button type="button" className="card-action card-action-delete" onClick={() => onDelete(activity)} aria-label={`刪除 ${activity.title}`}><Trash2 /></button></div>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function VotesView({ state, memberId, onVote, onPublish }: { state: TripState; memberId: string | null; onVote: (activityId: string, vote: VoteChoice) => void; onPublish: (activityId: string) => void }) {
  const isLeader = state.members.find((member) => member.id === memberId)?.isLeader;
  return (
    <section>
      <p className="eyebrow">投票與邀請</p>
      <h2 className="page-title">一齊揀活動</h2>
      <p className="mt-1 text-sm text-slate-500">投票提供參考，最終由團長發布到每日行程</p>
      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        {state.proposals.map((proposal) => {
          const activity = state.activities.find((item) => item.id === proposal.activityId);
          if (!activity) return null;
          const counts = { yes: 0, maybe: 0, no: 0 };
          Object.values(proposal.votes).forEach((vote) => counts[vote]++);
          const isInvited = Boolean(memberId && proposal.invitedIds.includes(memberId));
          return (
            <article key={proposal.activityId} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(23,32,51,0.05)]">
              <div className="flex gap-4"><ActivityPhoto activity={activity} className="size-20 rounded-2xl object-cover" /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-[#ef6a54]">{activity.city}</p><Badge className={proposal.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}>{proposal.status === "published" ? "已發布" : "投票中"}</Badge></div><h3 className="mt-1 truncate text-lg font-bold">{activity.title}</h3><p className="mt-1 text-xs text-slate-500">已邀請 {proposal.invitedIds.length} 位團友</p><p className="mt-1 text-xs font-semibold text-slate-600">{proposal.date && proposal.time && proposal.endTime ? scheduleRangeLabel({ date: proposal.date, time: proposal.time, endTime: proposal.endTime, endDate: proposal.endDate }) : "日期及時間待設定"}</p></div></div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                <VoteButton disabled={!isInvited || proposal.status === "published"} active={memberId ? proposal.votes[memberId] === "yes" : false} onClick={() => onVote(activity.id, "yes")} label="參加" count={counts.yes} tone="yes" />
                <VoteButton disabled={!isInvited || proposal.status === "published"} active={memberId ? proposal.votes[memberId] === "maybe" : false} onClick={() => onVote(activity.id, "maybe")} label="未決定" count={counts.maybe} tone="maybe" />
                <VoteButton disabled={!isInvited || proposal.status === "published"} active={memberId ? proposal.votes[memberId] === "no" : false} onClick={() => onVote(activity.id, "no")} label="不參加" count={counts.no} tone="no" />
              </div>
              {!isInvited && <p className="mt-3 text-center text-xs text-slate-400">你不在這次邀請名單內</p>}
              <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="mb-3 flex items-center justify-between text-xs text-slate-500"><span>已回覆 {Object.keys(proposal.votes).length}/{proposal.invitedIds.length}</span><span>{proposal.status === "published" ? "已加入參加者行程" : "等待團長發布"}</span></div>
                {isLeader && proposal.status === "voting" && <Button className="w-full rounded-xl bg-[#172033] text-white hover:bg-[#26334d]" onClick={() => onPublish(activity.id)}><Check /> 根據結果發布到每日行程</Button>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function VoteButton({ active, disabled, onClick, label, count, tone }: { active: boolean; disabled?: boolean; onClick: () => void; label: string; count: number; tone: string }) {
  return <button type="button" disabled={disabled} className={`vote-button vote-${tone} ${active ? "active" : ""}`} onClick={onClick}><span>{label}</span><strong>{count}</strong></button>;
}

function SideButton({ active, icon, children, onClick, count }: { active: boolean; icon: React.ReactNode; children: React.ReactNode; onClick: () => void; count?: number }) {
  return <button type="button" className={`side-button ${active ? "active" : ""}`} onClick={onClick}>{icon}<span className="flex-1 text-left">{children}</span>{Boolean(count) && <span className="grid size-5 place-items-center rounded-full bg-[#ef6a54] text-[10px] text-white">{count}</span>}</button>;
}

function BottomButton({ active, icon, children, onClick }: { active: boolean; icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" className={`bottom-button ${active ? "active" : ""}`} onClick={onClick}>{icon}<span>{children}</span></button>;
}

function MemberDot({ member }: { member: TripState["members"][number] }) {
  return <span className="grid size-7 place-items-center rounded-full border-2 border-[#172033] text-[10px] font-bold text-white" style={{ background: member.color }}>{memberInitial(member.name)}</span>;
}

function ActivityPhoto({ activity, className }: { activity: Activity; className: string }) {
  if (activity.image) return <img src={activity.image} alt={activity.imageAlt || activity.title} className={className} />;
  return <div className={`${className} grid place-items-center bg-gradient-to-br from-[#fff0ec] to-[#e8eef8] text-[#ef6a54]`} role="img" aria-label={`${activity.title}未有相片`}><ImagePlus size={24} /></div>;
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex gap-3 rounded-2xl bg-slate-50 p-3.5"><span className="mt-0.5 text-[#ef6a54]">{icon}</span><div><p className="text-xs font-semibold text-slate-400">{label}</p><p className="mt-0.5 text-sm font-semibold text-slate-700">{value}</p></div></div>;
}

function EditorField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block min-w-0 space-y-2 text-sm font-bold text-slate-700"><span>{label}{required && <i className="ml-1 not-italic text-[#ef6a54]">*</i>}</span>{children}</label>;
}

function ReadOnlyField({ label, value }: { label: string; value?: string }) {
  return <div className="min-w-0 space-y-2"><p className="text-sm font-bold text-slate-700">{label}</p><div className="min-h-12 whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-white px-3 py-3 text-base leading-6 text-slate-700 [overflow-wrap:anywhere]">{value || "未填寫"}</div></div>;
}

function ScheduleConflictList({ conflicts, members }: { conflicts: ScheduleConflict[]; members: TripState["members"] }) {
  return <ul className="mt-2 space-y-2 text-left text-sm">{conflicts.map(({ item, memberIds }, index) => <li key={`${item.id}-${index}`} className="rounded-xl bg-amber-50 p-3 text-amber-950"><p className="font-bold">{memberIds.map((id) => members.find((member) => member.id === id)?.name ?? id).join("、")}</p><p>{scheduleRangeLabel(item)}</p><p className="break-words">{item.title}</p></li>)}</ul>;
}

function LoadingScreen() {
  return <div className="grid min-h-dvh place-items-center bg-[#f7f8fb]"><div className="text-center"><div className="brand-mark mx-auto animate-pulse"><Route size={20} /></div><p className="mt-4 text-sm font-semibold text-slate-500">正在整理大家的行程…</p></div></div>;
}

function InvalidInvite() {
  return <main className="grid min-h-dvh place-items-center bg-[#f7f8fb] p-6"><div className="max-w-sm rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/50"><div className="brand-mark mx-auto"><Menu size={20} /></div><h1 className="mt-5 text-2xl font-bold">需要私人邀請連結</h1><p className="mt-3 text-sm leading-6 text-slate-500">請使用團長分享的完整連結開啟旅程。如果連結已失效，請向團長索取新連結。</p></div></main>;
}

declare global {
  interface Document {
    readonly modelContext?: {
      registerTool(tool: { name: string; title?: string; description: string; inputSchema: object; annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }; execute(input: unknown): unknown | Promise<unknown> }, options?: { signal?: AbortSignal }): void | Promise<void>;
    };
  }
}
