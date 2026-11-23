import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE INDEX IF NOT EXISTS \`posts_tags_tag_idx\` ON \`posts_tags\` (\`tag\`);`)
  await db.run(
    sql`CREATE INDEX IF NOT EXISTS \`posts_status_published_at_idx\` ON \`posts\` (\`status\`, \`published_at\`);`,
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP INDEX IF EXISTS \`posts_tags_tag_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`posts_status_published_at_idx\`;`)
}
