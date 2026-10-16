import "server-only";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";

export async function categoriesAndModels() {
  const [categories, models] = await Promise.all([
    db.select({ id: schema.partCategories.id, name: schema.partCategories.name }).from(schema.partCategories).orderBy(asc(schema.partCategories.name)),
    db.select().from(schema.machineModels).orderBy(asc(schema.machineModels.make), asc(schema.machineModels.model)),
  ]);
  return { categories, models: models.map((m) => ({ id: m.id, label: `${m.make} ${m.model}` })) };
}

export async function activeSuppliers() {
  return db.select().from(schema.suppliers).orderBy(asc(schema.suppliers.name));
}
