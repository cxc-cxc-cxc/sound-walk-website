import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Seed admin user
  const hashedPassword = await bcrypt.hash("SwAdmin!2026#Lpz", 12);
  await prisma.user.upsert({
    where: { email: "admin@soundwalk.app" },
    update: {},
    create: {
      email: "admin@soundwalk.app",
      name: "Admin",
      hashedPassword,
      role: "admin",
    },
  });

  // Seed walk info
  const existingInfo = await prisma.soundWalkInfo.findFirst();
  if (!existingInfo) {
    await prisma.soundWalkInfo.create({
      data: {
        title: "Leipzig Sound Walk",
        description: "An immersive audio journey through Leipzig. Discover hidden soundscapes at 15 unique locations across the city.",
        aboutText: "This sound walk invites you to explore Leipzig through its sonic landscape. Each location reveals a unique layer of the city's rich musical and cultural heritage — from the echoing halls near Bach's church to the vibrant energy of its market squares. Put on your headphones, follow the map, and let the sounds guide your experience.",
        instructions: "1. Enable location services on your device\n2. Put on headphones for the best experience\n3. Follow the map to each numbered location\n4. When you're within range, the audio will automatically play\n5. Take your time at each spot — listen and observe\n6. Track your progress as you visit each location\n\nTip: Visit during different times of day for varied soundscapes!",
        artistName: "",
        year: "",
        city: "Leipzig",
        credits: "",
        accentColor: "#14b8a6",
        backgroundColor: "#030712",
        fontFamily: "system",
        mapCenterLat: 51.3397,
        mapCenterLng: 12.3731,
        mapZoom: 15,
        mapStyle: "dark",
        defaultProximityRadius: 50,
        audioFadeDuration: 2.0,
        audioBaseVolume: 0.8,
        showWelcomePage: true,
        welcomeTitle: "Leipzig Sound Walk",
        welcomeSubtitle: "An immersive audio journey through the city of music",
        welcomeImageUrl: "",
        welcomeImageCloudPath: "",
        welcomeImageIsPublic: true,
      },
    });
  } else {
    // Update existing info to Leipzig if still Berlin defaults
    await prisma.soundWalkInfo.update({
      where: { id: existingInfo.id },
      data: {
        city: existingInfo.city || "Leipzig",
        mapCenterLat: existingInfo.mapCenterLat === 0 ? 51.3397 : existingInfo.mapCenterLat,
        mapCenterLng: existingInfo.mapCenterLng === 0 ? 12.3731 : existingInfo.mapCenterLng,
      },
    });
  }

  // 15 Sound locations in Leipzig
  const locations = [
    { name: "Thomaskirche", description: "The church of Johann Sebastian Bach. Listen to the resonant acoustics that have shaped centuries of choral music. Organ practice often drifts through the stone walls into the surrounding square.", latitude: 51.3389, longitude: 12.3722, orderIndex: 0 },
    { name: "Marktplatz", description: "Leipzig's central market square buzzes with vendors, conversations, and footsteps echoing off the Old Town Hall facade. A crossroads of daily urban rhythm.", latitude: 51.3406, longitude: 12.3747, orderIndex: 1 },
    { name: "Nikolaikirche", description: "The Church of St. Nicholas, birthplace of the Peaceful Revolution. Its courtyard captures whispered prayers, pigeon wings, and the weight of history in every stone.", latitude: 51.3405, longitude: 12.3788, orderIndex: 2 },
    { name: "Mädler-Passage", description: "This elegant covered arcade carries the sound of heels on marble, muffled café music, and the subtle hum of luxury retail — a sonic time capsule of old-world commerce.", latitude: 51.3401, longitude: 12.3752, orderIndex: 3 },
    { name: "Augustusplatz", description: "Leipzig's grandest square frames the Opera House and Gewandhaus. Wind sweeps across the open expanse, carrying fragments of rehearsals and tram announcements.", latitude: 51.3388, longitude: 12.3813, orderIndex: 4 },
    { name: "Gewandhaus Forecourt", description: "Standing before one of the world's finest concert halls, you catch the muted tuning of orchestras, the splash of the Mendebrunnen fountain, and anticipatory chatter of concertgoers.", latitude: 51.3380, longitude: 12.3806, orderIndex: 5 },
    { name: "Johannapark", description: "A green oasis along the river Pleiße. Bird song layers over children's laughter, rustling leaves, and the gentle current of water beneath footbridges.", latitude: 51.3341, longitude: 12.3694, orderIndex: 6 },
    { name: "Karl-Liebknecht-Straße (KarLi)", description: "Leipzig's bohemian artery. Bar music spills onto sidewalks, bicycle chains click past, and multilingual conversations fill the air with creative energy.", latitude: 51.3298, longitude: 12.3733, orderIndex: 7 },
    { name: "Clara-Zetkin-Park Entrance", description: "The gateway to Leipzig's largest park. Joggers' footfalls, distant dog barks, and the rustle of centuries-old trees create a layered natural soundscape.", latitude: 51.3310, longitude: 12.3600, orderIndex: 8 },
    { name: "Baumwollspinnerei Gate", description: "The former cotton mill, now an art district. Industrial echoes mix with gallery openings, studio sounds, and the creative pulse of Leipzig's art scene.", latitude: 51.3175, longitude: 12.3283, orderIndex: 9 },
    { name: "Plagwitz Canal", description: "Industrial heritage meets nature along this waterway. Water lapping against old brick walls, kayak paddles, and birdsong in reclaimed green spaces.", latitude: 51.3280, longitude: 12.3380, orderIndex: 10 },
    { name: "Hauptbahnhof Main Hall", description: "Europe's largest railway terminus by floor area. The grand hall amplifies announcements, rolling luggage, and the rhythmic departure of trains into an urban symphony.", latitude: 51.3449, longitude: 12.3816, orderIndex: 11 },
    { name: "Völkerschlachtdenkmal", description: "The Monument to the Battle of the Nations. Wind whistles through the massive stone structure while echoes of footsteps in the crypt create an almost spiritual resonance.", latitude: 51.3126, longitude: 12.4131, orderIndex: 12 },
    { name: "Schiller Park", description: "A quiet neighborhood park where morning birdsong, playground sounds, and the distant hum of the city create a contemplative atmosphere.", latitude: 51.3355, longitude: 12.3894, orderIndex: 13 },
    { name: "Connewitz Kreuz", description: "The vibrant crossroads of Leipzig's alternative culture. Street art, live music venues, and community gardens create an eclectic sonic signature.", latitude: 51.3145, longitude: 12.3750, orderIndex: 14 },
  ];

  for (const loc of locations) {
    const existing = await prisma.soundLocation.findFirst({
      where: { name: loc.name },
    });
    if (!existing) {
      await prisma.soundLocation.create({
        data: {
          name: loc.name,
          description: loc.description,
          latitude: loc.latitude,
          longitude: loc.longitude,
          orderIndex: loc.orderIndex,
          isActive: true,
          audioIsPublic: true,
          proximityRadius: 50,
        },
      });
    }
  }

  console.log("Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
