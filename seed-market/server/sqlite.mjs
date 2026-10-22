import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
export function createLocalDB(filename=":memory:") {
  const sql=new DatabaseSync(filename);
  sql.exec(readFileSync(new URL("./schema.sql",import.meta.url),"utf8"));
  sql.exec(readFileSync(new URL("./operations.sql",import.meta.url),"utf8"));
  sql.exec("PRAGMA busy_timeout=5000;");
  const db={
    prepare(text){
      const make=(params=[])=>({
        bind(...values){return make(values);},
        async first(){return sql.prepare(text).get(...params)??null;},
        async all(){return {results:sql.prepare(text).all(...params)};},
        async run(){const r=sql.prepare(text).run(...params);return {success:true,meta:{changes:Number(r.changes)}};},
        _run(){if(/^\s*(SELECT|WITH)/i.test(text))return {results:sql.prepare(text).all(...params)};const r=sql.prepare(text).run(...params);return {success:true,meta:{changes:Number(r.changes)}};}
      });
      return make();
    },
    async batch(statements){
      sql.exec("BEGIN IMMEDIATE");
      try{const results=statements.map(x=>x._run());sql.exec("COMMIT");return results;}
      catch(error){sql.exec("ROLLBACK");throw error;}
    },
    close(){sql.close();}
  };
  return db;
}
