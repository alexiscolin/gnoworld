// A guest's name (D351, D430): two words and four base32 characters from bytes the caller drew, so the
// pure rule holds no chance. The relayed nick is "anon/" and the name, 32 characters at most (Ergo's nicklen).
export const GUEST_NAME_BYTES = 8;
export const GUEST_PREFIX = "anon/";
export const GUEST_ADJECTIVES: readonly string[] = `
able agile amber ample ancient arctic ardent astral autumn azure
balmy bold brave breezy bright brisk bubbly calm candid careful
cheery chilly clever cosmic cozy crisp curious dainty dapper dashing
dazzling deft dewy eager earnest easy elfin epic even fabled
fair famous fancy fearless feisty fiery fleet fluffy fond frosty
gentle giddy gilded glad gleamy glossy golden graceful grand great
gutsy handy happy hardy hearty hazy honest humble hushed icy
idle jaunty jolly jovial joyful keen kind lively lofty lucky
lunar mellow merry mighty mild minty misty modest mossy nimble
noble novel nutty odd olive opal plucky polite proud pure
quick quiet rapid rare ready regal rich robust rosy royal
rustic sandy sassy savvy serene shiny silent silky silver sleek
smart smiley snappy snowy solar spry steady stellar sturdy sunny
superb sweet tame tidy tiny topaz tough trusty twinkly upbeat
vast velvet vivid wandering warm wavy whimsy wild windy winged
wise witty woolly zany zesty zippy lilac coral ivory cobalt
maple cedar brazen dusky dreamy fuzzy glowing hopeful lazy loyal
lush mirthy nifty peppy perky placid pliant primed prompt rangy
rested roomy sage shapely sharp sincere skilful smooth sonic spiffy
spunky stable stout sublime supple tender thrifty tranquil trim unique
`
  .trim()
  .split(/\s+/);
export const GUEST_ANIMALS: readonly string[] = `
alpaca badger bat bear beaver bee bison boar bunny camel
capybara cat chipmunk cobra cod condor cougar coyote crab crane
cricket crow deer dingo dolphin donkey dove dragonfly duck eagle
eel egret elk emu falcon ferret finch firefly fox frog
gazelle gecko gerbil gibbon giraffe goat goose gopher gorilla grouse
gull hamster hare hawk hedgehog heron hippo hornet horse hound
hyena ibex ibis iguana impala jackal jaguar jay jellyfish kestrel
kingfisher kiwi koala lark lemming lemur leopard lion lizard llama
lobster loon lynx macaw magpie mallard manatee mantis marmot marten
meerkat mink mole mongoose moose moth mouse mule narwhal newt
nightjar ocelot octopus okapi orca oriole osprey otter owl oyster
panda panther parrot peacock pelican penguin pheasant pigeon pika piranha
platypus pony porpoise puffin puma quail quokka rabbit raccoon ram
raven reindeer robin salmon sandpiper seal shark sheep shrew skink
skunk sloth snail sparrow squid squirrel starling stork swallow swan
swift tapir tern thrush tiger toad toucan trout tuna turkey
turtle viper vole wallaby walrus warbler weasel whale wolf wombat
woodpecker wren yak zebra beetle bluejay bobcat bunting cardinal chameleon
cheetah cormorant dormouse flamingo gannet kakapo mustang pangolin stoat aardvark
antelope armadillo baboon barnacle buffalo bulldog butterfly caribou cassowary catfish
`
  .trim()
  .split(/\s+/);

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
const word = (list: readonly string[], n: number): string => list[n % list.length] ?? "";

// ponytail: a 16-bit draw over 200 words is off by 0.3% at most between two words; widen the draw if names ever matter to fairness.
export function guestName(random: Uint8Array): string {
  if (random.length < GUEST_NAME_BYTES) throw new RangeError(`a guest's name takes ${String(GUEST_NAME_BYTES)} bytes`);
  const view = new DataView(random.buffer, random.byteOffset, random.byteLength);
  const suffix = [15, 10, 5, 0].map((shift) => BASE32.charAt((view.getUint32(4) >> shift) & 31)).join("");
  return `${word(GUEST_ADJECTIVES, view.getUint16(0))}-${word(GUEST_ANIMALS, view.getUint16(2))}-${suffix}`;
}
