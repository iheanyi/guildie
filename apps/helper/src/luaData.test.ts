import { expect, test } from "bun:test";
import { guildDataFile, toLua } from "./luaData";

test("data literals only, strings escaped", () => {
	expect(toLua({ reagents: { 2589: { name: 'Linen "Cloth"\\', users: [{ name: "Ðemo", recipes: 3 }] } } })).toBe(
		'{["reagents"]={[2589]={["name"]="Linen \\"Cloth\\"\\\\",["users"]={{["name"]="\xc3\x90emo",["recipes"]=3}}}}}',
	);
});

test("a name can't break out of its string", () => {
	const lua = toLua({ name: '"]=1} os.exit() --\n' });
	expect(lua).toBe('{["name"]="\\"]=1} os.exit() --\\10"}');
});

test("file header", () => {
	expect(guildDataFile({ version: 1 })).toStartWith("-- Written by the Guildie helper");
});
