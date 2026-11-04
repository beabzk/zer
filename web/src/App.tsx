import React, { useState, useEffect } from "react";
import { useSession } from "./lib/auth";
import { api } from "./lib/api";
import type { AuthConfig, Tree } from "./lib/types";
import { ToastProvider, useToast } from "./components/ui/Toast";
import { Header } from "./components/Header";
import { LoginPage } from "./pages/LoginPage";
import { SetupPage } from "./pages/SetupPage";
import { TreeSelectPage } from "./pages/TreeSelectPage";
import { TreeInvitationPage } from "./pages/TreeInvitationPage";
import { AdminPage } from "./pages/AdminPage";
import { OverviewView } from "./views/OverviewView";
import { DirectoryView } from "./views/DirectoryView";
import { PersonView } from "./views/PersonView";
import { GraphView } from "./views/GraphView";
import { LineageView } from "./views/LineageView";
import { KinshipView } from "./views/KinshipView";
import { MembersView } from "./views/MembersView";
import { IndividualForm } from "./components/forms/IndividualForm";
import { RelationshipForm } from "./components/forms/RelationshipForm";
import { TreeForm } from "./components/forms/TreeForm";
import { TreeSettingsModal } from "./components/forms/TreeSettingsModal";

export const AppContent: React.FC = () => {
  const toast = useToast();
  const { data: session, isPending: sessionPending } = useSession();

  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [isSetupMode, setIsSetupMode] = useState(false);

  // Tree state
  const [trees, setTrees] = useState<Tree[]>([]);
  const [currentTree, setCurrentTree] = useState<Tree | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Navigation state
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [graphRootId, setGraphRootId] = useState<string | undefined>(undefined);
  const [lineageRootId, setLineageRootId] = useState<string | undefined>(undefined);
  const [kinshipAId, setKinshipAId] = useState<string | undefined>(undefined);
  const [kinshipBId, setKinshipBId] = useState<string | undefined>(undefined);

  // Tree Invitation Token in URL
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  // Global action modals
  const [addPersonModalOpen, setAddPersonModalOpen] = useState(false);
  const [addRelationshipModalOpen, setAddRelationshipModalOpen] = useState(false);
  const [createTreeModalOpen, setCreateTreeModalOpen] = useState(false);
  const [treeSettingsModalOpen, setTreeSettingsModalOpen] = useState(false);

  // Load Auth Config on mount
  useEffect(() => {
    api
      .getAuthConfig()
      .then((cfg) => {
        setAuthConfig(cfg);
        if (cfg.setup_required) {
          setIsSetupMode(true);
        }
      })
      .catch(() => {})
      .finally(() => setConfigLoading(false));
  }, []);

  // Parse Hash on mount & popstate
  const parseHash = () => {
    const hash = window.location.hash.replace(/^#/, "");

    // Check for tree invite in hash: #tree-invite=TOKEN or #tree-invite?invite=TOKEN
    if (hash.startsWith("tree-invite")) {
      const match = hash.match(/invite=([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        setInviteToken(match[1]);
        return;
      }
    }

    if (!hash) {
      setActiveTab("overview");
      return;
    }

    const parts = hash.split("/");
    const main = parts[0];
    const sub = parts[1];

    if (main === "person" && sub) {
      setSelectedPersonId(sub);
      setActiveTab("person");
    } else if (main === "graph") {
      if (sub) setGraphRootId(sub);
      setActiveTab("graph");
    } else if (main === "lineage") {
      if (sub) setLineageRootId(sub);
      setActiveTab("lineage");
    } else if (main === "kinship") {
      if (sub) setKinshipAId(sub);
      if (parts[2]) setKinshipBId(parts[2]);
      setActiveTab("kinship");
    } else if (["overview", "people", "members", "admin"].includes(main)) {
      setActiveTab(main);
    }
  };

  useEffect(() => {
    parseHash();
    window.addEventListener("hashchange", parseHash);
    return () => window.removeEventListener("hashchange", parseHash);
  }, []);

  // Sync hash when active tab or person changes
  const navigateTo = (tab: string, personId?: string) => {
    setActiveTab(tab);
    if (tab === "person" && personId) {
      setSelectedPersonId(personId);
      window.location.hash = `person/${personId}`;
    } else if (tab === "graph") {
      if (personId) {
        setGraphRootId(personId);
        window.location.hash = `graph/${personId}`;
      } else {
        window.location.hash = "graph";
      }
    } else if (tab === "lineage") {
      if (personId) {
        setLineageRootId(personId);
        window.location.hash = `lineage/${personId}`;
      } else {
        window.location.hash = "lineage";
      }
    } else if (tab === "kinship") {
      window.location.hash = "kinship";
    } else {
      window.location.hash = tab;
    }
  };

  // Load user's trees & admin status when session is ready
  const loadTrees = () => {
    if (!session?.user) return;

    api
      .listTrees()
      .then((treeList) => {
        setTrees(treeList);
        // If stored active tree exists in sessionStorage, re-select it
        const savedTreeId = sessionStorage.getItem("zer_active_tree_id");
        const found = treeList.find((t) => t.id === savedTreeId);
        if (found) {
          setCurrentTree(found);
        } else if (treeList.length > 0 && !currentTree) {
          setCurrentTree(treeList[0]);
          sessionStorage.setItem("zer_active_tree_id", treeList[0].id);
        }
      })
      .catch((err) => toast.error(err.message));

    api
      .getAdminStatus()
      .then((res) => setIsAdmin(res.is_admin))
      .catch(() => setIsAdmin(false));
  };

  useEffect(() => {
    if (session?.user) {
      loadTrees();
    }
  }, [session?.user]);

  const handleSelectTree = (tree: Tree) => {
    setCurrentTree(tree);
    sessionStorage.setItem("zer_active_tree_id", tree.id);
    navigateTo("overview");
  };

  if (configLoading || sessionPending) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-stone-300 border-t-amber-800 rounded-full animate-spin mx-auto" />
          <p className="text-xs text-stone-500 font-mono">Connecting to Zer engine...</p>
        </div>
      </div>
    );
  }

  // Setup screen for first-run
  if (isSetupMode) {
    return (
      <SetupPage
        onSuccess={() => {
          setIsSetupMode(false);
          window.location.reload();
        }}
      />
    );
  }

  // Unauthenticated -> Login screen
  if (!session?.user) {
    return (
      <LoginPage
        authConfig={authConfig}
        onSuccess={() => window.location.reload()}
        onNavigateSetup={() => setIsSetupMode(true)}
      />
    );
  }

  // Handle tree invitation flow if token exists
  if (inviteToken) {
    return (
      <TreeInvitationPage
        token={inviteToken}
        onAccepted={(treeId) => {
          setInviteToken(null);
          window.location.hash = "";
          loadTrees();
          api.listTrees().then((ts) => {
            const found = ts.find((t) => t.id === treeId);
            if (found) handleSelectTree(found);
          });
        }}
        onCancel={() => {
          setInviteToken(null);
          window.location.hash = "";
        }}
      />
    );
  }

  // Instance Admin Console View
  if (activeTab === "admin" && isAdmin) {
    return <AdminPage onBack={() => navigateTo("overview")} />;
  }

  // If no tree is selected or user has 0 trees, show Tree Select Page
  if (!currentTree) {
    return (
      <TreeSelectPage
        trees={trees}
        onSelectTree={handleSelectTree}
        onRefreshTrees={loadTrees}
        isAdmin={isAdmin}
        onNavigateAdmin={() => navigateTo("admin")}
      />
    );
  }

  // Main Tree Workspace
  return (
    <div
      className={`min-h-screen bg-stone-100/60 flex flex-col ${activeTab === "graph" ? "h-screen overflow-hidden" : ""}`}
    >
      <Header
        currentTree={currentTree}
        trees={trees}
        onSelectTree={handleSelectTree}
        onOpenCreateTree={() => setCreateTreeModalOpen(true)}
        onOpenTreeSettings={() => setTreeSettingsModalOpen(true)}
        activeTab={activeTab}
        onNavigateTab={(tab) => navigateTo(tab)}
        isAdmin={isAdmin}
      />

      <main
        className={`flex-1 ${activeTab === "graph" ? "overflow-hidden flex flex-col min-h-0" : "pb-16"}`}
      >
        {activeTab === "overview" && (
          <OverviewView
            treeId={currentTree.id}
            onNavigatePerson={(id) => navigateTo("person", id)}
            onNavigateTab={(tab) => navigateTo(tab)}
            onOpenAddPerson={() => setAddPersonModalOpen(true)}
            onOpenAddRelationship={() => setAddRelationshipModalOpen(true)}
          />
        )}

        {activeTab === "people" && (
          <DirectoryView
            treeId={currentTree.id}
            onNavigatePerson={(id) => navigateTo("person", id)}
            onNavigateGraph={(id) => navigateTo("graph", id)}
            onNavigateLineage={(id) => navigateTo("lineage", id)}
            onOpenAddPerson={() => setAddPersonModalOpen(true)}
          />
        )}

        {activeTab === "person" && selectedPersonId && (
          <PersonView
            treeId={currentTree.id}
            personId={selectedPersonId}
            onBack={() => navigateTo("people")}
            onNavigatePerson={(id) => navigateTo("person", id)}
            onNavigateGraph={(id) => navigateTo("graph", id)}
            onNavigateLineage={(id) => navigateTo("lineage", id)}
            onNavigateKinshipWith={(id) => {
              setKinshipAId(id);
              navigateTo("kinship");
            }}
          />
        )}

        {activeTab === "graph" && (
          <GraphView
            treeId={currentTree.id}
            initialRootId={graphRootId || selectedPersonId || undefined}
            onNavigatePerson={(id) => navigateTo("person", id)}
          />
        )}

        {activeTab === "lineage" && (
          <LineageView
            treeId={currentTree.id}
            initialRootId={lineageRootId || selectedPersonId || undefined}
            onNavigatePerson={(id) => navigateTo("person", id)}
          />
        )}

        {activeTab === "kinship" && (
          <KinshipView
            treeId={currentTree.id}
            initialPersonAId={kinshipAId}
            initialPersonBId={kinshipBId}
            onNavigatePerson={(id) => navigateTo("person", id)}
          />
        )}

        {activeTab === "members" && (
          <MembersView treeId={currentTree.id} userRole={currentTree.role} />
        )}
      </main>

      {/* Global Add Person Modal */}
      <IndividualForm
        isOpen={addPersonModalOpen}
        onClose={() => setAddPersonModalOpen(false)}
        treeId={currentTree.id}
        onSuccess={(person) => {
          navigateTo("person", person.id);
        }}
      />

      {/* Global Link Relationship Modal */}
      <RelationshipForm
        isOpen={addRelationshipModalOpen}
        onClose={() => setAddRelationshipModalOpen(false)}
        treeId={currentTree.id}
        onSuccess={() => {
          // Re-render
          navigateTo(activeTab);
        }}
      />

      {/* Global Create Tree Modal */}
      <TreeForm
        isOpen={createTreeModalOpen}
        onClose={() => setCreateTreeModalOpen(false)}
        onSuccess={(newTree) => {
          loadTrees();
          handleSelectTree(newTree);
        }}
      />

      {/* Tree Settings Modal */}
      {currentTree && (
        <TreeSettingsModal
          isOpen={treeSettingsModalOpen}
          onClose={() => setTreeSettingsModalOpen(false)}
          tree={currentTree}
          onSuccess={(updated) => {
            setCurrentTree(updated);
            loadTrees();
            navigateTo(activeTab);
          }}
        />
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
};
