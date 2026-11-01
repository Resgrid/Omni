import {
  AlarmClock as RawAlarmClock,
  AlertCircle as RawAlertCircle,
  AlertTriangle as RawAlertTriangle,
  ArrowLeft as RawArrowLeft,
  ArrowRight as RawArrowRight,
  Bell as RawBell,
  BellIcon as RawBellIcon,
  BluetoothIcon as RawBluetoothIcon,
  BookOpenIcon as RawBookOpenIcon,
  Box as RawBox,
  BuildingIcon as RawBuildingIcon,
  Calendar as RawCalendar,
  CalendarClock as RawCalendarClock,
  CalendarClockIcon as RawCalendarClockIcon,
  CalendarDays as RawCalendarDays,
  CalendarIcon as RawCalendarIcon,
  Check as RawCheck,
  CheckCircle as RawCheckCircle,
  CheckCircleIcon as RawCheckCircleIcon,
  CheckIcon as RawCheckIcon,
  ChevronDown as RawChevronDown,
  ChevronDownIcon as RawChevronDownIcon,
  ChevronLeft as RawChevronLeft,
  ChevronRight as RawChevronRight,
  ChevronRightIcon as RawChevronRightIcon,
  ChevronUpIcon as RawChevronUpIcon,
  Circle as RawCircle,
  ClipboardListIcon as RawClipboardListIcon,
  Clock as RawClock,
  ClockIcon as RawClockIcon,
  CloudAlert as RawCloudAlert,
  CloudLightning as RawCloudLightning,
  Contact as RawContact,
  Edit2Icon as RawEdit2Icon,
  EditIcon as RawEditIcon,
  ExpandIcon as RawExpandIcon,
  ExternalLink as RawExternalLink,
  EyeIcon as RawEyeIcon,
  EyeOffIcon as RawEyeOffIcon,
  FileText as RawFileText,
  FileTextIcon as RawFileTextIcon,
  Filter as RawFilter,
  FilterIcon as RawFilterIcon,
  Globe as RawGlobe,
  GlobeIcon as RawGlobeIcon,
  Headphones as RawHeadphones,
  HomeIcon as RawHomeIcon,
  IdCard as RawIdCard,
  Info as RawInfo,
  LinkIcon as RawLinkIcon,
  ListTree as RawListTree,
  Loader2 as RawLoader2,
  Lock as RawLock,
  LockKeyhole as RawLockKeyhole,
  LogIn as RawLogIn,
  type LucideProps,
  Mail as RawMail,
  MailIcon as RawMailIcon,
  MailOpen as RawMailOpen,
  Map as RawMap,
  MapPin as RawMapPin,
  MapPinIcon as RawMapPinIcon,
  Megaphone as RawMegaphone,
  Menu as RawMenu,
  MessageCircle as RawMessageCircle,
  MessageCircleIcon as RawMessageCircleIcon,
  MessageSquarePlus as RawMessageSquarePlus,
  MessagesSquareIcon as RawMessagesSquareIcon,
  Mic as RawMic,
  MicOff as RawMicOff,
  MoreVertical as RawMoreVertical,
  MoreVerticalIcon as RawMoreVerticalIcon,
  Navigation as RawNavigation,
  NetworkIcon as RawNetworkIcon,
  Notebook as RawNotebook,
  Phone as RawPhone,
  PhoneIcon as RawPhoneIcon,
  PhoneOff as RawPhoneOff,
  Plus as RawPlus,
  PlusIcon as RawPlusIcon,
  RadioIcon as RawRadioIcon,
  RadioTower as RawRadioTower,
  RefreshCw as RawRefreshCw,
  RefreshCwIcon as RawRefreshCwIcon,
  Reply as RawReply,
  RotateCcwIcon as RawRotateCcwIcon,
  Search as RawSearch,
  SearchIcon as RawSearchIcon,
  Send as RawSend,
  Settings as RawSettings,
  SettingsIcon as RawSettingsIcon,
  ShieldAlertIcon as RawShieldAlertIcon,
  ShieldCheck as RawShieldCheck,
  ShieldCheckIcon as RawShieldCheckIcon,
  ShieldIcon as RawShieldIcon,
  SmartphoneIcon as RawSmartphoneIcon,
  Speaker as RawSpeaker,
  StarIcon as RawStarIcon,
  Tag as RawTag,
  TimerIcon as RawTimerIcon,
  TimerReset as RawTimerReset,
  Trash2 as RawTrash2,
  Trash2Icon as RawTrash2Icon,
  TrashIcon as RawTrashIcon,
  Truck as RawTruck,
  User as RawUser,
  UserCogIcon as RawUserCogIcon,
  UserIcon as RawUserIcon,
  UserPlusIcon as RawUserPlusIcon,
  Users as RawUsers,
  UsersIcon as RawUsersIcon,
  WifiIcon as RawWifiIcon,
  X as RawX,
  XCircle as RawXCircle,
  XIcon as RawXIcon,
} from 'lucide-react-native';
import { styled } from 'nativewind';
import type React from 'react';

/**
 * lucide icons that understand `className` — the union of every legacy app's set.
 *
 * nativewind v5 dropped the JSX transform: a `className` only has an effect on a component
 * that has been through `styled()`, and metro's polyfill only covers `react-native` itself.
 * On a raw lucide icon the class was silently discarded -- which is why `text-*` colours and
 * `mr-*` spacing had no effect and icons rendered with their default near-black stroke.
 *
 * `target: 'style'` keeps layout utilities working, and `nativeStyleMapping` lifts the
 * resolved colour out of the style object onto lucide's `color` prop, which is where
 * react-native-svg resolves `currentColor` from.
 *
 * Never pass `style` to a lucide icon (web/Electron break) — wrap it in a View instead. Icons used
 * without a className can be imported straight from `lucide-react-native`; add an icon here (or
 * wrap one ad hoc with `themed()`) when it needs a className.
 */
const iconMapping = {
  className: {
    target: 'style',
    nativeStyleMapping: {
      color: 'color',
    },
  },
} as const;

export type LucideIcon = React.ComponentType<LucideProps>;
export type { LucideProps };

/** Makes a lucide icon className-aware (colour + layout utilities). */
export const themed = <T extends LucideIcon>(Component: T): T => styled(Component as LucideIcon, iconMapping) as unknown as T;

export const AlarmClock = themed(RawAlarmClock);
export const AlertCircle = themed(RawAlertCircle);
export const AlertTriangle = themed(RawAlertTriangle);
export const ArrowLeft = themed(RawArrowLeft);
export const ArrowRight = themed(RawArrowRight);
export const Bell = themed(RawBell);
export const BellIcon = themed(RawBellIcon);
export const BluetoothIcon = themed(RawBluetoothIcon);
export const BookOpenIcon = themed(RawBookOpenIcon);
export const Box = themed(RawBox);
export const BuildingIcon = themed(RawBuildingIcon);
export const Calendar = themed(RawCalendar);
export const CalendarClock = themed(RawCalendarClock);
export const CalendarClockIcon = themed(RawCalendarClockIcon);
export const CalendarDays = themed(RawCalendarDays);
export const CalendarIcon = themed(RawCalendarIcon);
export const Check = themed(RawCheck);
export const CheckCircle = themed(RawCheckCircle);
export const CheckCircleIcon = themed(RawCheckCircleIcon);
export const CheckIcon = themed(RawCheckIcon);
export const ChevronDown = themed(RawChevronDown);
export const ChevronDownIcon = themed(RawChevronDownIcon);
export const ChevronLeft = themed(RawChevronLeft);
export const ChevronRight = themed(RawChevronRight);
export const ChevronRightIcon = themed(RawChevronRightIcon);
export const ChevronUpIcon = themed(RawChevronUpIcon);
export const Circle = themed(RawCircle);
export const ClipboardListIcon = themed(RawClipboardListIcon);
export const Clock = themed(RawClock);
export const ClockIcon = themed(RawClockIcon);
export const CloudAlert = themed(RawCloudAlert);
export const CloudLightning = themed(RawCloudLightning);
export const Contact = themed(RawContact);
export const Edit2Icon = themed(RawEdit2Icon);
export const EditIcon = themed(RawEditIcon);
export const ExpandIcon = themed(RawExpandIcon);
export const ExternalLink = themed(RawExternalLink);
export const EyeIcon = themed(RawEyeIcon);
export const EyeOffIcon = themed(RawEyeOffIcon);
export const FileText = themed(RawFileText);
export const FileTextIcon = themed(RawFileTextIcon);
export const Filter = themed(RawFilter);
export const FilterIcon = themed(RawFilterIcon);
export const Globe = themed(RawGlobe);
export const GlobeIcon = themed(RawGlobeIcon);
export const Headphones = themed(RawHeadphones);
export const HomeIcon = themed(RawHomeIcon);
export const IdCard = themed(RawIdCard);
export const Info = themed(RawInfo);
export const LinkIcon = themed(RawLinkIcon);
export const ListTree = themed(RawListTree);
export const Loader2 = themed(RawLoader2);
export const Lock = themed(RawLock);
export const LockKeyhole = themed(RawLockKeyhole);
export const LogIn = themed(RawLogIn);
export const Mail = themed(RawMail);
export const MailIcon = themed(RawMailIcon);
export const MailOpen = themed(RawMailOpen);
export const Map = themed(RawMap);
export const MapPin = themed(RawMapPin);
export const MapPinIcon = themed(RawMapPinIcon);
export const Megaphone = themed(RawMegaphone);
export const Menu = themed(RawMenu);
export const MessageCircle = themed(RawMessageCircle);
export const MessageCircleIcon = themed(RawMessageCircleIcon);
export const MessageSquarePlus = themed(RawMessageSquarePlus);
export const MessagesSquareIcon = themed(RawMessagesSquareIcon);
export const Mic = themed(RawMic);
export const MicOff = themed(RawMicOff);
export const MoreVertical = themed(RawMoreVertical);
export const MoreVerticalIcon = themed(RawMoreVerticalIcon);
export const Navigation = themed(RawNavigation);
export const NetworkIcon = themed(RawNetworkIcon);
export const Notebook = themed(RawNotebook);
export const Phone = themed(RawPhone);
export const PhoneIcon = themed(RawPhoneIcon);
export const PhoneOff = themed(RawPhoneOff);
export const Plus = themed(RawPlus);
export const PlusIcon = themed(RawPlusIcon);
export const RadioIcon = themed(RawRadioIcon);
export const RadioTower = themed(RawRadioTower);
export const RefreshCw = themed(RawRefreshCw);
export const RefreshCwIcon = themed(RawRefreshCwIcon);
export const Reply = themed(RawReply);
export const RotateCcwIcon = themed(RawRotateCcwIcon);
export const Search = themed(RawSearch);
export const SearchIcon = themed(RawSearchIcon);
export const Send = themed(RawSend);
export const Settings = themed(RawSettings);
export const SettingsIcon = themed(RawSettingsIcon);
export const ShieldAlertIcon = themed(RawShieldAlertIcon);
export const ShieldCheck = themed(RawShieldCheck);
export const ShieldCheckIcon = themed(RawShieldCheckIcon);
export const ShieldIcon = themed(RawShieldIcon);
export const SmartphoneIcon = themed(RawSmartphoneIcon);
export const Speaker = themed(RawSpeaker);
export const StarIcon = themed(RawStarIcon);
export const Tag = themed(RawTag);
export const TimerIcon = themed(RawTimerIcon);
export const TimerReset = themed(RawTimerReset);
export const Trash2 = themed(RawTrash2);
export const Trash2Icon = themed(RawTrash2Icon);
export const TrashIcon = themed(RawTrashIcon);
export const Truck = themed(RawTruck);
export const User = themed(RawUser);
export const UserCogIcon = themed(RawUserCogIcon);
export const UserIcon = themed(RawUserIcon);
export const UserPlusIcon = themed(RawUserPlusIcon);
export const Users = themed(RawUsers);
export const UsersIcon = themed(RawUsersIcon);
export const WifiIcon = themed(RawWifiIcon);
export const X = themed(RawX);
export const XCircle = themed(RawXCircle);
export const XIcon = themed(RawXIcon);
