CREATE TABLE "cows" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"name" text,
	"sex" text NOT NULL,
	"breed" text NOT NULL,
	"age_days" real NOT NULL,
	"weight_kg" real NOT NULL,
	"mature_weight_kg" real NOT NULL,
	"body_condition_score" real NOT NULL,
	"health" real NOT NULL,
	"fertility" real NOT NULL,
	"pregnant" boolean DEFAULT false NOT NULL,
	"pregnancy_days" real,
	"status" text NOT NULL,
	"current_paddock_id" text,
	"birth_sim_hour" integer NOT NULL,
	"exit_sim_hour" integer
);
--> statement-breakpoint
CREATE TABLE "farm_events" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"sim_hour" integer NOT NULL,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farms" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"sim_hour" integer DEFAULT 0 NOT NULL,
	"last_simulated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"season" text DEFAULT 'spring' NOT NULL,
	"weather_today" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"money_usd" real DEFAULT 10000 NOT NULL,
	"seed" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paddocks" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"name" text NOT NULL,
	"cell_ids" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pasture_cells" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" text NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"grass_biomass_kg_ha" real NOT NULL,
	"max_biomass_kg_ha" real NOT NULL,
	"root_health" real NOT NULL,
	"soil_health" real NOT NULL,
	"soil_moisture" real NOT NULL,
	"nutrients" real NOT NULL,
	"biodiversity" real NOT NULL,
	"last_grazed_at" integer,
	"last_manured_at" integer
);
--> statement-breakpoint
ALTER TABLE "cows" ADD CONSTRAINT "cows_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_events" ADD CONSTRAINT "farm_events_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paddocks" ADD CONSTRAINT "paddocks_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pasture_cells" ADD CONSTRAINT "pasture_cells_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;