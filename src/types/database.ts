export type MemberRole = 'Leader' | 'Deputy' | 'Member';

export type Member = {
  id: string;
  name: string;
  total_power: number;
  legion_1: number;
  legion_2: number;
  legion_3: number;
  legion_4: number;
  group_id: number;
  role: MemberRole;
  created_at: string;
};

export type MemberInsert = Omit<Member, 'id' | 'created_at'> & {
  id?: string;
  created_at?: string;
};

export type MemberUpdate = Partial<Omit<Member, 'id' | 'created_at'>>;

export type LoginEvent = {
  id: string;
  username: string;
  mode: 'admin' | 'viewer';
  created_at: string;
};

export type LoginEventInsert = Omit<LoginEvent, 'id' | 'created_at'> & {
  id?: string;
  created_at?: string;
};

export type Database = {
  public: {
    Tables: {
      members: {
        Row: Member;
        Insert: MemberInsert;
        Update: MemberUpdate;
        Relationships: [];
      };
      login_events: {
        Row: LoginEvent;
        Insert: LoginEventInsert;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
