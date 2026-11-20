CREATE TABLE "landing_action_days" (
    "day" DATE NOT NULL,
    "action" TEXT NOT NULL,
    "utm_source" TEXT NOT NULL,
    "utm_medium" TEXT NOT NULL,
    "utm_campaign" TEXT NOT NULL,
    "referrer_host" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "landing_action_days_pkey" PRIMARY KEY ("day", "action", "utm_source", "utm_medium", "utm_campaign", "referrer_host")
);

CREATE TABLE "user_signup_campaigns" (
    "user_id" TEXT NOT NULL,
    "campaign" JSONB NOT NULL,
    CONSTRAINT "user_signup_campaigns_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "user_signup_campaigns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
