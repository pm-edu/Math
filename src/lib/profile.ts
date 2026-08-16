import type { Role } from "@/lib/roles";

export type Profile = {
  id: string;
  name: string | null;
  email: string | null;
  role: Role;
  created_at: string;
  class_id: string | null;
  grade_level: string | null;
  unpaid: boolean;
};

export type ClassRow = {
  id: string;
  name: string;
  teacher_id: string | null;
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
    id: string;
    slug: string;
    title: string;
    category: string;
    price: number;
  } | null;
};
