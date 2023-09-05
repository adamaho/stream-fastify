import Fastify from "fastify";

import { Realtime } from "./realtime";
import { readFileSync } from "node:fs";

type Todo = {
  id: string;
  task: string;
  checked: boolean;
};

const todos: Todo[] = [];

const realtime = new Realtime("todos");

const fastify = Fastify({
  http2: true,
  https: {
    key: readFileSync("key.pem"),
    cert: readFileSync("cert.pem"),
  },
  logger: true,
});

fastify.get("/", function handler(req, res) {
  realtime.subscribe(req.raw, res.raw, () => Promise.resolve(todos));
});

fastify.get(
  "/add",
  {
    schema: {
      querystring: {
        task: { type: "string" },
      },
    },
  },
  async function handler(req, res) {
    const newTodo = {
      id: crypto.randomUUID(),
      task: (req.query as { task: string }).task,
      checked: false,
    } satisfies Todo;

    todos.push(newTodo);

    realtime.publish([...todos]);
    res.send("added todo");
  }
);

async function main() {
  try {
    await fastify.listen({ port: 3000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
