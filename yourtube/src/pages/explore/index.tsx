import CategoryTabs from "@/components/category-tabs";
import Videogrid from "@/components/Videogrid";

export default function ExplorePage() {
  return (
    <main className="flex-1 p-4">
      <h1 className="mb-4 text-2xl font-semibold">Explore videos</h1>
      <CategoryTabs />
      <Videogrid />
    </main>
  );
}
