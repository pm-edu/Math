export type Profile = {
  id: string;
  name: string | null;
  email: string | null;
  role: "student" | "admin";
  created_at: string;
};

export type Contact = {
  id: string;
  name: string | null;
  email: string;
  message: string;
  created_at: string;
};

export type EnrollmentRequest = {
  id: string;
  status: string;
  purchased_at: string;
  user_id: string;
  course_id: string;
  student_name: string | null;
  student_email: string | null;
  course_title: string | null;
  course_price: number | null;
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
