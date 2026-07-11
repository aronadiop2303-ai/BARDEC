export type UserRole = 'CUSTOMER' | 'BUYER' | 'APPROVER' | 'VENDOR' | 'ADMIN';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  company?: string;
  creditLimit?: number;
  creditBalance?: number;
  pendingApprovals?: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  images: string[];
  pricePublic: number;
  priceWholesale: number;
  minQuantity: number;
  category: string;
  vendorId: string;
  vendorName: string;
  rating: number;
  reviewCount: number;
  stock: number;
  tags: string[];
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  image: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: 'pending' | 'pending_approval' | 'approved' | 'shipped' | 'ready_for_delivery' | 'out_for_delivery' | 'completed' | 'cancelled';
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  date: string;
  trackingNumber?: string;
  purchaseOrderNumber?: string;
  estimatedDelivery?: string;
}

export interface CartItem {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  image: string;
  maxStock: number;
}

export const DEMO_USERS: User[] = [
  {
    id: 'u1',
    name: 'Sophie Martin',
    email: 'customer@bardec.com',
    role: 'CUSTOMER',
  },
  {
    id: 'u2',
    name: 'Ahmed Diallo',
    email: 'buyer@bardec.com',
    role: 'BUYER',
    company: 'Diallo Imports SA',
    creditLimit: 50000,
    creditBalance: 32000,
    pendingApprovals: 3,
  },
  {
    id: 'u3',
    name: 'Fatou Koné',
    email: 'approver@bardec.com',
    role: 'APPROVER',
    company: 'Diallo Imports SA',
    pendingApprovals: 5,
  },
  {
    id: 'u4',
    name: 'Carlos Vega',
    email: 'vendor@bardec.com',
    role: 'VENDOR',
    company: 'Vega Electronics Co.',
  },
  {
    id: 'u5',
    name: 'Amina Hassan',
    email: 'admin@bardec.com',
    role: 'ADMIN',
  },
];

export const CATEGORIES = [
  { id: 'all', name: 'All', icon: 'grid' },
  { id: 'electronics', name: 'Electronics', icon: 'cpu' },
  { id: 'textiles', name: 'Textiles', icon: 'layers' },
  { id: 'agri', name: 'Agriculture', icon: 'leaf' },
  { id: 'chemicals', name: 'Chemicals', icon: 'droplet' },
  { id: 'machinery', name: 'Machinery', icon: 'tool' },
  { id: 'food', name: 'Food & Bev', icon: 'coffee' },
  { id: 'auto', name: 'Auto Parts', icon: 'truck' },
];

export const MOCK_PRODUCTS: Product[] = [
  {
    id: 'p1',
    name: 'Industrial LED Panel 100W',
    description: 'High-efficiency industrial LED panel with 5-year warranty. Perfect for warehouses, factories, and commercial spaces.',
    images: ['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400', 'https://images.unsplash.com/photo-1529148482759-b35b25c5f217?w=400'],
    pricePublic: 89.99,
    priceWholesale: 52.00,
    minQuantity: 50,
    category: 'electronics',
    vendorId: 'v1',
    vendorName: 'Vega Electronics Co.',
    rating: 4.7,
    reviewCount: 284,
    stock: 1200,
    tags: ['LED', 'industrial', 'lighting'],
  },
  {
    id: 'p2',
    name: 'Premium Cotton Fabric Roll',
    description: 'High-quality 100% cotton fabric, 300 thread count. Available in multiple colors. MOQ 100 rolls.',
    images: ['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400'],
    pricePublic: 45.00,
    priceWholesale: 28.50,
    minQuantity: 100,
    category: 'textiles',
    vendorId: 'v2',
    vendorName: 'Dakar Textiles Ltd.',
    rating: 4.5,
    reviewCount: 156,
    stock: 5000,
    tags: ['cotton', 'fabric', 'premium'],
  },
  {
    id: 'p3',
    name: 'Stainless Steel Mixing Tank 500L',
    description: 'Food-grade stainless steel mixing tank with agitator. CE certified. Ideal for food, pharma, and chemical industries.',
    images: ['https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=400'],
    pricePublic: 2800.00,
    priceWholesale: 1950.00,
    minQuantity: 2,
    category: 'machinery',
    vendorId: 'v3',
    vendorName: 'TechMach Industries',
    rating: 4.8,
    reviewCount: 42,
    stock: 30,
    tags: ['stainless steel', 'tank', 'food-grade'],
  },
  {
    id: 'p4',
    name: 'Organic Shea Butter (Bulk)',
    description: 'Unrefined organic shea butter, direct from cooperatives in Burkina Faso. 25kg containers.',
    images: ['https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=400'],
    pricePublic: 180.00,
    priceWholesale: 115.00,
    minQuantity: 20,
    category: 'agri',
    vendorId: 'v4',
    vendorName: 'Sahel Naturals',
    rating: 4.9,
    reviewCount: 93,
    stock: 450,
    tags: ['shea', 'organic', 'cosmetics'],
  },
  {
    id: 'p5',
    name: 'Solar Charge Controller 60A MPPT',
    description: 'Advanced MPPT solar charge controller, 12V/24V/48V auto-detect. Suitable for off-grid systems.',
    images: ['https://images.unsplash.com/photo-1509391366360-2e959784a276?w=400'],
    pricePublic: 129.00,
    priceWholesale: 78.50,
    minQuantity: 10,
    category: 'electronics',
    vendorId: 'v1',
    vendorName: 'Vega Electronics Co.',
    rating: 4.6,
    reviewCount: 217,
    stock: 800,
    tags: ['solar', 'mppt', 'renewable'],
  },
  {
    id: 'p6',
    name: 'Arabica Green Coffee Beans',
    description: 'Premium Ethiopian Arabica green coffee beans, Grade 1. Direct trade from small farms.',
    images: ['https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400'],
    pricePublic: 8.50,
    priceWholesale: 5.20,
    minQuantity: 500,
    category: 'food',
    vendorId: 'v5',
    vendorName: 'Ethiopian Coffee Export',
    rating: 4.9,
    reviewCount: 331,
    stock: 25000,
    tags: ['coffee', 'arabica', 'ethiopia'],
  },
  {
    id: 'p7',
    name: 'Industrial Hydraulic Pump',
    description: 'High-pressure hydraulic gear pump, 25cc/rev, max 250 bar. For construction and industrial machinery.',
    images: ['https://images.unsplash.com/photo-1581092921461-7031ad3a6f59?w=400'],
    pricePublic: 320.00,
    priceWholesale: 195.00,
    minQuantity: 5,
    category: 'machinery',
    vendorId: 'v3',
    vendorName: 'TechMach Industries',
    rating: 4.4,
    reviewCount: 67,
    stock: 120,
    tags: ['hydraulic', 'pump', 'industrial'],
  },
  {
    id: 'p8',
    name: 'Polyester Mesh Bag 50kg',
    description: 'Heavy-duty woven polypropylene bags, UV treated. For agriculture, construction, and industrial use.',
    images: ['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400'],
    pricePublic: 1.20,
    priceWholesale: 0.72,
    minQuantity: 5000,
    category: 'agri',
    vendorId: 'v6',
    vendorName: 'PackPro Solutions',
    rating: 4.3,
    reviewCount: 189,
    stock: 500000,
    tags: ['bags', 'packaging', 'agriculture'],
  },
];

export const MOCK_ORDERS: Order[] = [
  {
    id: 'o1',
    orderNumber: 'BDC-2024-001234',
    status: 'shipped',
    items: [
      { productId: 'p1', productName: 'Industrial LED Panel 100W', quantity: 100, price: 52.00, image: '' },
    ],
    subtotal: 5200.00,
    shipping: 0,
    tax: 416.00,
    total: 5616.00,
    date: '2024-01-15',
    trackingNumber: 'DHL987654321',
    purchaseOrderNumber: 'PO-2024-0089',
    estimatedDelivery: '2024-01-22',
  },
  {
    id: 'o2',
    orderNumber: 'BDC-2024-001156',
    status: 'pending_approval',
    items: [
      { productId: 'p5', productName: 'Solar Charge Controller 60A MPPT', quantity: 50, price: 78.50, image: '' },
      { productId: 'p2', productName: 'Premium Cotton Fabric Roll', quantity: 200, price: 28.50, image: '' },
    ],
    subtotal: 9625.00,
    shipping: 0,
    tax: 770.00,
    total: 10395.00,
    date: '2024-01-18',
    purchaseOrderNumber: 'PO-2024-0102',
  },
  {
    id: 'o3',
    orderNumber: 'BDC-2024-000987',
    status: 'completed',
    items: [
      { productId: 'p4', productName: 'Organic Shea Butter (Bulk)', quantity: 50, price: 115.00, image: '' },
    ],
    subtotal: 5750.00,
    shipping: 0,
    tax: 460.00,
    total: 6210.00,
    date: '2024-01-05',
  },
  {
    id: 'o4',
    orderNumber: 'BDC-2024-001298',
    status: 'pending',
    items: [
      { productId: 'p6', productName: 'Arabica Green Coffee Beans', quantity: 1000, price: 5.20, image: '' },
    ],
    subtotal: 5200.00,
    shipping: 120,
    tax: 416.00,
    total: 5736.00,
    date: '2024-01-20',
  },
];

export const MOCK_CONVERSATIONS = [
  {
    id: 'c1',
    name: 'Vega Electronics Co.',
    lastMessage: 'The shipment tracking number is DHL987...',
    time: '10:45',
    unread: 2,
    avatar: 'VE',
  },
  {
    id: 'c2',
    name: 'Dakar Textiles Ltd.',
    lastMessage: 'We can offer a 5% discount on 500+ rolls',
    time: 'Yesterday',
    unread: 0,
    avatar: 'DT',
  },
  {
    id: 'c3',
    name: 'Sahel Naturals',
    lastMessage: 'Your quote is ready for review',
    time: 'Mon',
    unread: 1,
    avatar: 'SN',
  },
];

export const VENDOR_STATS = {
  totalSales: 284750,
  activeOrders: 47,
  responseRate: 98,
  totalProducts: 142,
  avgRating: 4.7,
  monthlySales: [18500, 22000, 19800, 26000, 28400, 31200, 27800, 33500, 29000, 35200, 32100, 38600],
};

export const ADMIN_STATS = {
  totalUsers: 12847,
  totalVendors: 523,
  totalOrders: 48294,
  totalRevenue: 9284750,
  pendingVendors: 18,
  activeDisputes: 7,
  monthlyGrowth: 12.4,
};

export const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B',
  pending_approval: '#8B5CF6',
  approved: '#3B82F6',
  shipped: '#0EA5E9',
  ready_for_delivery: '#06B6D4',
  out_for_delivery: '#10B981',
  completed: '#22C55E',
  cancelled: '#EF4444',
};
