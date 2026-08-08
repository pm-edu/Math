export type Profile = {
  id: string;
  name: string | null;
  email: string | null;
  role: "student" | "admin";
  created_at: string;
};

export type PurchasedCourse = {
  id: string;
  status: string;
  purchased_at: string;
  course: {
    slug: string;
    title: string;
    category: string;
    price: number;
  } | null;
};
