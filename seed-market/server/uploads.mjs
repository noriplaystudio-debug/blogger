// Keep a durable cleanup record until object storage confirms deletion. Removing
// the upload row first prevents a listing from attaching a file being deleted.
export async function flushUploadCleanup(db,bucket,ownerId){
  if(!bucket)return;
  const jobs=await db.prepare("SELECT id,object_key FROM upload_cleanup WHERE owner_id=? ORDER BY created_at LIMIT 15").bind(ownerId).all();
  for(const job of jobs.results){
    try{await bucket.delete(job.object_key);await db.prepare("DELETE FROM upload_cleanup WHERE id=? AND owner_id=?").bind(job.id,ownerId).run();}
    catch{console.error("seed upload storage cleanup deferred");}
  }
}
export async function discardTemporaryUpload(db,bucket,id,ownerId){
  const removed=await db.batch([
    db.prepare("INSERT OR IGNORE INTO upload_cleanup(id,owner_id,object_key,created_at) SELECT id,owner_id,object_key,? FROM uploads WHERE id=? AND owner_id=? AND idea_id IS NULL").bind(new Date().toISOString(),id,ownerId),
    db.prepare("DELETE FROM uploads WHERE id=? AND owner_id=? AND idea_id IS NULL AND EXISTS(SELECT 1 FROM upload_cleanup WHERE id=?)").bind(id,ownerId,id)
  ]);
  if(!removed[1].meta.changes)return false;
  await flushUploadCleanup(db,bucket,ownerId);return true;
}
