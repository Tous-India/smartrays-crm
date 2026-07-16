/**
 * Superagent (which supertest wraps) has no default parser for the binary
 * content types this API returns (xlsx exports), so `.buffer(true)` alone
 * leaves `response.body` as an empty object instead of a Buffer. Pass this to
 * `.parse()` on any request expecting a binary response.
 *
 * Usage: agent.get("/api/v1/leads/export").buffer(true).parse(bufferParser)
 */
export function bufferParser(res, callback) {
  res.setEncoding("binary");
  let data = "";

  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    callback(null, Buffer.from(data, "binary"));
  });
}
