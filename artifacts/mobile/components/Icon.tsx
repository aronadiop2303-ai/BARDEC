/**
 * Icon.tsx — Drop-in replacement for `import { Feather } from '@expo/vector-icons'`
 *
 * Uses lucide-react-native (SVG-based) instead of font-based icons so no font
 * file loading is required. This permanently fixes icon rendering on Android
 * Expo Go, where expo-font TTF delivery through the Replit Metro proxy is
 * unreliable for physical devices.
 *
 * Usage (identical to @expo/vector-icons Feather):
 *   import { Feather } from '@/components/Icon';
 *   <Feather name="home" size={24} color="#000" />
 */

import React from 'react';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowRightCircle,
  BarChart2,
  Bell,
  Briefcase,
  Camera,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Code,
  Copy,
  CreditCard,
  Database,
  DollarSign,
  Download,
  Edit,
  Edit2,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  Heart,
  Home,
  Image as LucideImage,
  Key,
  Link,
  List,
  Lock,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Mic,
  Minus,
  MoreVertical,
  Navigation,
  Package,
  Paperclip,
  Phone,
  Plus,
  PlusCircle,
  RefreshCw,
  Search,
  Send,
  Settings,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Sliders,
  Smile,
  Star,
  Tag,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Upload,
  User,
  UserPlus,
  Wind,
  X,
  XCircle,
  Zap,
} from 'lucide-react-native';
import type { LucideProps } from 'lucide-react-native';

// ─── icon map: Feather name → Lucide component ───────────────────────────────
const ICON_MAP = {
  'alert-circle':       AlertCircle,
  'alert-triangle':     AlertTriangle,
  'arrow-left':         ArrowLeft,
  'arrow-right':        ArrowRight,
  'arrow-right-circle': ArrowRightCircle,
  'bar-chart-2':        BarChart2,
  'bell':               Bell,
  'briefcase':          Briefcase,
  'camera':             Camera,
  'check':              Check,
  'check-circle':       CheckCircle,
  'chevron-down':       ChevronDown,
  'chevron-left':       ChevronLeft,
  'chevron-right':      ChevronRight,
  'chevron-up':         ChevronUp,
  'clock':              Clock,
  'code':               Code,
  'copy':               Copy,
  'credit-card':        CreditCard,
  'database':           Database,
  'dollar-sign':        DollarSign,
  'download':           Download,
  'edit':               Edit,
  'edit-2':             Edit2,
  'external-link':      ExternalLink,
  'eye':                Eye,
  'file-text':          FileText,
  'globe':              Globe,
  'heart':              Heart,
  'home':               Home,
  'image':              LucideImage,
  'key':                Key,
  'link':               Link,
  'list':               List,
  'lock':               Lock,
  'log-in':             LogIn,
  'log-out':            LogOut,
  'mail':               Mail,
  'map-pin':            MapPin,
  'message-circle':     MessageCircle,
  'mic':                Mic,
  'minus':              Minus,
  'more-vertical':      MoreVertical,
  'navigation':         Navigation,
  'package':            Package,
  'paperclip':          Paperclip,
  'phone':              Phone,
  'plus':               Plus,
  'plus-circle':        PlusCircle,
  'refresh-cw':         RefreshCw,
  'search':             Search,
  'send':               Send,
  'settings':           Settings,
  'shield':             Shield,
  'shopping-bag':       ShoppingBag,
  'shopping-cart':      ShoppingCart,
  'sliders':            Sliders,
  'smile':              Smile,
  'star':               Star,
  'tag':                Tag,
  'thumbs-down':        ThumbsDown,
  'thumbs-up':          ThumbsUp,
  'trash-2':            Trash2,
  'upload':             Upload,
  'user':               User,
  'user-plus':          UserPlus,
  'wind':               Wind,
  'x':                  X,
  'x-circle':           XCircle,
  'zap':                Zap,
} as const;

type FeatherName = keyof typeof ICON_MAP;

export interface FeatherProps {
  name: string;
  size?: number;
  color?: ColorValue | string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Feather-compatible icon component backed by lucide-react-native (SVG).
 * Falls back to AlertCircle for unknown icon names so nothing crashes.
 */
export function Feather({ name, size = 24, color = 'black', style }: FeatherProps) {
  const Component: React.ComponentType<LucideProps> =
    ICON_MAP[name as FeatherName] ?? AlertCircle;
  return (
    <Component
      size={size}
      color={color as string}
      style={style as LucideProps['style']}
    />
  );
}

export default Feather;
